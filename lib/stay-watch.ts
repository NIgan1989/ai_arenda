import {wordsOf,venueOr,TYPE_SQL} from './stay-words';
import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';
import {arrivalDue,lateUntil} from './late-arrival';
import {assertCalendarAvailable} from './external-calendar';
import {ruleFor,minutesLabel,type RuleKey,type RuleValue} from './decision-rules';
import {cancellationTerms} from './cancellation';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// The AI administrator keeps a stay moving when a person is silent past a deadline. Every deadline follows the same
// ladder: remind → ask → act by the rule → hand over to a person. Each step is said once (stay_watch keeps how far it
// went), each notice goes to the AI journal of the person who gets it (lib/ai-move-marks.ts reads its key).
//
// Payment (lib/prepay.ts): a stay paid at the arrival is not watched here, its arrival is. A prepayment (the owner's
// share, or all of an older booking) is due at the arrival, at most a day after the request: three hours before it is due the guest is reminded, at the due time both sides are warned, thirty minutes
// later an unpaid stay is released and the home is free again. Payments are an imitation until the launch, so
// releasing takes no money and returns none; a stay paid in part is never released, the owner decides.
// Arrival: a paid guest who has not checked in is asked whether they are coming; with no answer the owner's
// autopilot releases the stay, without it the owner decides. «Задерживаюсь на час» moves the arrival and starts over.
// Checkout: at the end of the stay the guest is reminded, thirty minutes later the owner and the cleaner hear the
// guest is still there (the service admin too when the next guest is close), two hours later the service admin.

// The waits and the reminder lead are each person's choice (lib/decision-rules.ts); these are the fixed parts.
export const PAY_MIN_WINDOW=1800,PAY_HOLD=24*3600;
export const ARRIVAL_ASK={hourly:900,daily:3600},ARRIVAL_ACT={hourly:1800,daily:7200};
export const CHECKOUT_WARN=1800,NEXT_CLOSE=3*3600;

const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const hourly=(b:Row)=>b.billing_mode==='hourly'?'hourly':'daily';

// When the stay has to be paid: the arrival, but never sooner than half an hour after the request (a stay booked for
// right now still leaves the guest time to pay) and never later than a day after it, so that a stay booked far ahead
// does not hold the dates unpaid until the arrival.
export function payDue(b:{start:number;created_at:number}){return Math.max(Number(b.created_at)+PAY_MIN_WINDOW,Math.min(Number(b.start),Number(b.created_at)+PAY_HOLD));}
// A step counts only for the deadline it was taken for: a stay moved to other dates or times starts over.
const PAY_FOR='MAX(b.created_at+'+PAY_MIN_WINDOW+',MIN(b.start,b.created_at+'+PAY_HOLD+'))',ARRIVAL_FOR='MAX(b.start,COALESCE(t.arrival_eta,0))',CHECKOUT_FOR='b.end';
const PAY_STEP=`CASE WHEN w.pay_for=${PAY_FOR} THEN w.pay_step ELSE 0 END`,ARRIVAL_STEP=`CASE WHEN w.arrival_for=${ARRIVAL_FOR} THEN w.arrival_step ELSE 0 END`,CHECKOUT_STEP=`CASE WHEN w.checkout_for=${CHECKOUT_FOR} THEN w.checkout_step ELSE 0 END`;
const STAY_SQL=`SELECT b.id,b.property_id,b.guest_id,b.start,b.end,b.created_at,b.payment_status,b.amount,p.owner_id,p.title,${TYPE_SQL},
 t.rate,t.units,t.deposit,t.deposit_status,COALESCE(t.min_hours,(SELECT pp.min_hours FROM property_policies pp WHERE pp.property_id=b.property_id),1) min_hours,
 t.billing_mode,t.occasion,t.paid_amount,t.actual_checkin,t.actual_checkout,t.checkin_reported_at,t.checkout_reported_at,t.payment_reported_at,t.arrival_eta,t.late_count,
 ${PAY_STEP} pay_step,${ARRIVAL_STEP} arrival_step,${CHECKOUT_STEP} checkout_step,
 EXISTS(SELECT 1 FROM property_policies pp WHERE pp.property_id=b.property_id AND pp.auto_confirm=1 AND pp.auto_assign=1 AND (pp.mandate_until=0 OR pp.mandate_until>?1)) autopilot
 FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id LEFT JOIN stay_watch w ON w.booking_id=b.id`;

// A stay the AI released is settled like a cancellation (lib/cancellation.ts): how much the guest gets back is written
// once, so the owner is asked to return exactly that and not everything paid. Nothing to return closes the matter.
const REFUNDS="COALESCE((SELECT SUM(amount) FROM finance_entries WHERE booking_id=booking_terms.booking_id AND kind='refund'),0)";
const settle=(db:D1Database,id:string,refund:number,at:number)=>q(db,`UPDATE booking_terms SET refund_due=?+${REFUNDS},refund_recorded_at=CASE WHEN ?=0 THEN ? ELSE NULL END
 WHERE booking_id=? AND refund_due IS NULL AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')`,refund,refund,at,id,id);
const tenge=(n:number)=>n.toLocaleString('ru-RU').replace(/\u00a0|\u202f/g,' ')+' ₸';
// The step is kept in one row per stay with the deadline it was taken for; a step is taken only by the sweep that
// moves it on, and a new deadline starts the step over from 0.
type Field='pay'|'arrival'|'checkout';
const step=(db:D1Database,id:string,field:Field,deadline:number,from:number,to:number,at:number)=>q(db,
 `INSERT INTO stay_watch(booking_id,${field}_step,${field}_for,updated_at) VALUES (?1,?3,?5,?4) ON CONFLICT(booking_id) DO UPDATE SET ${field}_step=?3,${field}_for=?5,updated_at=?4
  WHERE (stay_watch.${field}_for=?5 AND stay_watch.${field}_step=?2) OR (COALESCE(stay_watch.${field}_for,-1)<>?5 AND ?2=0)`,id,from,to,at,deadline);
const moved=(r:D1Result[])=>!!r[0]?.meta?.changes;
// Each person's choices in «Автопилот: решения и сроки», read once per sweep.
type Rules=(user:string,key:RuleKey)=>Promise<RuleValue>;
function rulesOf(db:D1Database):Rules{
 const seen=new Map<string,Promise<RuleValue>>();
 return (user,key)=>{const k=user+':'+key;if(!seen.has(k))seen.set(k,ruleFor(db,user,key));return seen.get(k)!;};
}

async function payments(db:D1Database,at:number,result:Row,rule:Rules){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND b.payment_status<>'owner_verified' AND t.actual_checkin IS NULL AND b.end>?1
  AND COALESCE(t.prepay_percent,100)>0 AND t.paid_amount<(b.amount*COALESCE(t.prepay_percent,100)+99)/100
  AND ${PAY_STEP}<3 ORDER BY b.start LIMIT 50`,at);
 for(const b of list){
  const due=payDue({start:b.start,created_at:b.created_at}),title=b.title||'жильё',s=Number(b.pay_step);
  const unpaid=await rule(b.owner_id,'unpaid'),remind=await rule(b.guest_id,'pay_remind'),grace=unpaid.minutes*60;
  if(at>=due+grace){
   if(b.payment_reported_at&&!b.checkin_reported_at&&!(Number(b.paid_amount)>0)){
    // Direct settlements: the guest says the transfer is sent. Only the owner sees their bank, so the AI never releases such a stay.
    if(moved(await db.batch([step(db,b.id,'pay',due,s,3,at),q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,'ИИ-администратор: гость сообщил о переводе за бронь «'+title+'», а вы ещё не ответили. Проверьте банк и отметьте в карточке брони: «Деньги получены» или «Перевод не пришёл».','owner:stay-pay-told:'+b.id+':'+due,at)])))result.warned++;
    continue;
   }
   if(Number(b.paid_amount)>0||b.checkin_reported_at){
    // Paid in part, or the guest says they are already inside: never released by the AI, the owner settles it.
    if(moved(await db.batch([step(db,b.id,'pay',due,s,3,at),q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,(b.checkin_reported_at?venueOr(b,'ИИ-администратор: гость сообщил, что заселился в «'+title+'», но оплата не отмечена. Отметьте оплату или договоритесь с гостем в чате брони.','ИИ-администратор: гость сообщил '+wordsOf(b).ofArrive+' в «'+title+'», но оплата не отмечена. Отметьте оплату или договоритесь с гостем в чате брони.'):'ИИ-администратор: бронь «'+title+'» оплачена не полностью. Отметьте остаток оплаты или договоритесь с гостем в чате брони.'),'owner:stay-pay-part:'+b.id+':'+due,at)])))result.warned++;
    continue;
   }
   if(!unpaid.on){
    // The owner keeps this decision: the AI only says the time is over.
    if(moved(await db.batch([step(db,b.id,'pay',due,s,3,at),q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,'ИИ-администратор: срок оплаты брони «'+title+'» прошёл, оплаты нет. Отметьте оплату, если она получена, или отмените бронь в карточке.','owner:stay-unpaid-ask:'+b.id+':'+due,at)])))result.warned++;
    continue;
   }
   const r=await db.batch([
    q(db,"UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed' AND payment_status<>'owner_verified' AND NOT EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND (actual_checkin IS NOT NULL OR checkin_reported_at IS NOT NULL OR payment_reported_at IS NOT NULL OR paid_amount>0)) AND NOT EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)",b.id,b.id,b.property_id,b.id),
    q(db,"UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned') AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",b.id,b.id),
    step(db,b.id,'pay',due,s,3,at),settle(db,b.id,0,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.guest_id,venueOr(b,'ИИ-администратор снял бронь «'+title+'»: оплата не поступила в срок. Если жильё ещё свободно, его можно забронировать заново.','ИИ-администратор снял бронь «'+title+'»: оплата не поступила в срок. Если время ещё свободно, его можно забронировать заново.'),'guest:stay-unpaid-released:'+b.id+':'+due,at,b.id),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.owner_id,venueOr(b,'ИИ-администратор снял неоплаченную бронь «'+title+'». Жильё снова свободно на эти даты.','ИИ-администратор снял неоплаченную бронь «'+title+'». Это время снова свободно.'),'owner:stay-unpaid-released:'+b.id+':'+due,at,b.id),
    q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'booking.unpaid_released',? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.id,at,b.id)]);
   if(r[0].meta.changes)result.released++;
   continue;
  }
  if(at>=due&&s<2){
   if(moved(await db.batch([step(db,b.id,'pay',due,s,2,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,'ИИ-администратор: бронь «'+title+'» не оплачена. Оплатите до '+clock(due+grace)+(unpaid.on?venueOr(b,', иначе бронь снимется и жильё станет свободным.',', иначе бронь снимется.'):', иначе владелец может отменить бронь.'),'guest:stay-pay-warn:'+b.id+':'+due,at),
    notice(db,b.owner_id,'ИИ-администратор: гость не оплатил бронь «'+title+'». Если оплата получена, отметьте её в брони. '+(unpaid.on?'Иначе в '+clock(due+grace)+' я сниму бронь.':'Решение о брони за вами: в '+clock(due+grace)+' я напомню.'),'owner:stay-pay-warn:'+b.id+':'+due,at)])))result.warned++;
   continue;
  }
  // The reminder makes sense only when there is time left to pay before the warning.
  const lead=remind.minutes*60;
  if(remind.on&&at>=due-lead&&at<due&&s<1&&due-lead>Number(b.created_at)){
   if(moved(await db.batch([step(db,b.id,'pay',due,s,1,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,'ИИ-администратор: оплатите бронь «'+title+'» до '+clock(due)+(unpaid.on?'. Без оплаты бронь снимется через '+minutesLabel(unpaid.minutes)+' после этого времени.':'.'),'guest:stay-pay-remind:'+b.id+':'+due,at)])))result.reminded++;
  }
 }
}

// Not coming is a late cancellation by the guest: the owner keeps the first day, night or the minimum hours.
function noShowTerms(b:Row,at:number){
 const c=cancellationTerms({by:'guest',status:'confirmed',mode:b.billing_mode||'daily',rate:Number(b.rate)||0,units:Number(b.units)||1,amount:Number(b.amount)||0,paid:Number(b.paid_amount)||0,deposit:b.deposit_status==='owner_verified'?Number(b.deposit)||0:0,start:b.start,minHours:Number(b.min_hours)||1,at,banquet:!!b.occasion});
 const deposit=c.deposit?' Депозит '+tenge(c.deposit)+' возвращается полностью.':'';
 const forGuest=c.withheld?'По правилам отмены владельцу остаётся '+tenge(c.withheld)+(c.refund?', вам вернут '+tenge(c.refund):'')+'.'+deposit:c.refund?'Вам вернут всю оплату: '+tenge(c.refund)+'.'+deposit:deposit.trim();
 const forOwner=c.withheld?'По правилам отмены у вас остаётся '+tenge(c.withheld)+(c.refund?', гостю нужно вернуть '+tenge(c.refund):'')+'.'+deposit:c.refund?'Верните гостю всю оплату: '+tenge(c.refund)+'.'+deposit:deposit.trim();
 return {c,forGuest,forOwner};
}

// The time of a stay is over and nobody checked in or said they were inside: there is nothing left to wait for, with
// or without the autopilot. The stay is closed as a no-show, its cleaning is not needed, the money follows the rules.
// «Меня не заселили» (lib/account-restrictions.ts): while the guest's complaint is open the booking is in dispute, and
// nothing settles it as the guest's no-show: a person at the platform decides.
const NOT_DISPUTED="NOT EXISTS(SELECT 1 FROM administrator_issues ni WHERE ni.entity_kind='booking' AND ni.entity_id=b.id AND ni.status='open' AND ni.description LIKE 'Меня не заселили%')";
async function emptyEnded(db:D1Database,at:number,result:Row){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND t.actual_checkin IS NULL AND t.checkin_reported_at IS NULL AND t.actual_checkout IS NULL AND b.end<=?1 AND ${NOT_DISPUTED}
  AND NOT EXISTS(SELECT 1 FROM property_operations o WHERE o.property_id=b.property_id AND o.active_booking_id=b.id) ORDER BY b.end LIMIT 50`,at);
 for(const b of list){
  const title=b.title||'жильё',{c,forGuest,forOwner}=noShowTerms(b,at),done="EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')";
  const r=await db.batch([
   q(db,"UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed' AND end<=? AND NOT EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND (actual_checkin IS NOT NULL OR checkin_reported_at IS NOT NULL)) AND NOT EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)",b.id,at,b.id,b.property_id,b.id),
   q(db,`INSERT OR IGNORE INTO notifications SELECT ?||j.id,j.assigned_to,?,'cleaner:booking-cancelled:'||j.id,0,? FROM cleaning_jobs j WHERE j.booking_id=? AND j.status='assigned' AND j.assigned_to IS NOT NULL AND ${done}`,uuid()+':',venueOr(b,'Гость не приехал в «'+title+'», уборка после этой брони не нужна. Задание снято.','Гость не пришёл в «'+title+'», уборка после этой брони не нужна. Задание снято.'),at,b.id,b.id),
   q(db,`UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned') AND ${done}`,b.id,b.id),
   settle(db,b.id,c.refund,at),
   q(db,`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE ${done}`,uuid(),b.guest_id,(venueOr(b,'ИИ-администратор: время брони «'+title+'» прошло, заселения не было. Бронь закрыта. ','ИИ-администратор: время брони «'+title+'» прошло, вы не пришли. Бронь закрыта. ')+forGuest).trim(),'guest:stay-no-show:'+b.id,at,b.id),
   q(db,`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE ${done}`,uuid(),b.owner_id,(venueOr(b,'ИИ-администратор: время брони «'+title+'» прошло, гость не заселился. Я закрыл бронь как неявку, уборка после неё не нужна. ','ИИ-администратор: время брони «'+title+'» прошло, гостей не было. Я закрыл бронь как неявку, уборка после неё не нужна. ')+forOwner).trim(),'owner:stay-no-show:'+b.id,at,b.id),
   q(db,`INSERT INTO audit_events SELECT ?,'ai-administrator',?,'booking.no_show_closed',? WHERE ${done}`,uuid(),b.id,at,b.id)]);
  if(r[0].meta.changes)result.released++;
 }
}

async function arrivals(db:D1Database,at:number,result:Row,rule:Rules){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND (b.payment_status='owner_verified' OR (COALESCE(t.prepay_percent,100)<100 AND t.paid_amount>=(b.amount*COALESCE(t.prepay_percent,100)+99)/100)) AND t.actual_checkin IS NULL AND t.checkin_reported_at IS NULL
  AND t.actual_checkout IS NULL AND b.end>?1 AND MAX(b.start,COALESCE(t.arrival_eta,0))<=?1 AND ${ARRIVAL_STEP}<2 AND ${NOT_DISPUTED} ORDER BY b.start LIMIT 50`,at);
 for(const b of list){
  const due=arrivalDue({start:b.start,arrival_eta:b.arrival_eta}),kind=hourly(b),title=b.title||'жильё',s=Number(b.arrival_step);
  // The owner's wait, but never more than half an hour for an hourly stay; the guest is asked halfway at the latest.
  const noShow=await rule(b.owner_id,'no_show'),act=kind==='hourly'?Math.min(noShow.minutes*60,ARRIVAL_ACT.hourly):noShow.minutes*60;
  const actAt=due+act,askAt=due+Math.min(ARRIVAL_ASK[kind],Math.floor(act/2)),releases=noShow.on&&Number(b.autopilot)>0;
  if(at>=actAt){
   if(releases){
    const {c,forGuest,forOwner}=noShowTerms(b,at);
    const r=await db.batch([
     q(db,"UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND (actual_checkin IS NOT NULL OR checkin_reported_at IS NOT NULL OR COALESCE(arrival_eta,0)<>?)) AND NOT EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)",b.id,b.id,Number(b.arrival_eta)||0,b.property_id,b.id),
     q(db,"UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned') AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",b.id,b.id),
     step(db,b.id,'arrival',due,s,2,at),settle(db,b.id,c.refund,at),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.guest_id,venueOr(b,'ИИ-администратор: вы не заселились в «'+title+'» и не ответили, бронь снята. ','ИИ-администратор: вы не пришли в «'+title+'» и не ответили, бронь снята. ')+forGuest,'guest:stay-no-show:'+b.id,at,b.id),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.owner_id,venueOr(b,'ИИ-администратор: гость не приехал в «'+title+'» и не ответил. Я отметил неявку и освободил жильё. ','ИИ-администратор: гости не пришли в «'+title+'» и не ответили. Я отметил неявку и освободил время. ')+forOwner,'owner:stay-no-show:'+b.id,at,b.id),
     q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'booking.no_show_released',? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.id,at,b.id)]);
    if(r[0].meta.changes){result.released++;continue;}
   }
   // Without the autopilot the owner decides: the guest may be there already and nobody pressed the button.
   if(moved(await db.batch([step(db,b.id,'arrival',due,s,2,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,venueOr(b,'ИИ-администратор: гость так и не заселился в «'+title+'» и не ответил. Если он на месте, подтвердите заселение; если не приедет, отмените бронь в карточке.','ИИ-администратор: '+wordsOf(b).notIn+' в «'+title+'» и не ответил. Если гости на месте, подтвердите '+wordsOf(b).arriveAcc+'; если не придут, отмените бронь в карточке.'),'owner:stay-no-show-ask:'+b.id+':'+due,at)])))result.warned++;
   continue;
  }
  if(at>=askAt&&s<1){
   if(moved(await db.batch([step(db,b.id,'arrival',due,s,1,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,venueOr(b,'ИИ-администратор: вы едете в «'+title+'»? Если задерживаетесь, нажмите «Задерживаюсь на час» в брони; если уже на месте, нажмите «Я заселился».','ИИ-администратор: вы едете в «'+title+'»? '+(lateUntil({start:Number(b.start),end:Number(b.end),arrival_eta:b.arrival_eta,late_count:b.late_count},at)?'Если задерживаетесь, нажмите «Задерживаюсь на час» в брони':'Если задерживаетесь, напишите владельцу в чате брони')+'; если уже на месте, нажмите «'+wordsOf(b).iAmIn+'».')+(releases?' Без ответа до '+clock(actAt)+' бронь может быть снята.':''),'guest:stay-arrival-ask:'+b.id+':'+due,at),
    notice(db,b.owner_id,venueOr(b,'ИИ-администратор: гость ещё не заселился в «'+title+'». Я спросил, едет ли он.','ИИ-администратор: '+wordsOf(b).notIn+' в «'+title+'». Я спросил, едут ли.'),'owner:stay-arrival-ask:'+b.id+':'+due,at)])))result.reminded++;
  }
 }
}

async function checkouts(db:D1Database,at:number,result:Row,admin:string[],rule:Rules){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND b.end<=?1 AND t.actual_checkout IS NULL AND t.checkout_reported_at IS NULL AND ${CHECKOUT_STEP}<3 ORDER BY b.end LIMIT 50`,at);
 for(const b of list){
  const title=b.title||'жильё',s=Number(b.checkout_step),late=at-Number(b.end);
  const handover=await rule(b.owner_id,'checkout');
  if(late>=handover.minutes*60&&s>=2&&s<3&&!handover.on){
   // The owner keeps the delay to themselves: the step closes without the service admin.
   await step(db,b.id,'checkout',Number(b.end),s,3,at).run();continue;
  }
  if(late>=handover.minutes*60&&s<3&&handover.on){
   if(moved(await db.batch([step(db,b.id,'checkout',Number(b.end),s,3,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,venueOr(b,'ИИ-администратор передал задержку выезда из «'+title+'» администратору сервиса. Подтвердите выезд, как только жильё освободится.','ИИ-администратор передал задержку в «'+title+'» администратору сервиса: '+wordsOf(b).notOut+'. Подтвердите '+wordsOf(b).leaveLow+', как только гости уйдут.'),'owner:stay-checkout-escalated:'+b.id+':'+b.end,at),
    ...admin.map(a=>notice(db,a,venueOr(b,'Гость не выехал из «'+title+'» больше '+minutesLabel(handover.minutes)+' после конца брони и не ответил. Свяжитесь с владельцем и гостем.','Гость не освободил «'+title+'» больше '+minutesLabel(handover.minutes)+' после конца брони и не ответил. Свяжитесь с владельцем и гостем.'),'admin:stay-checkout:'+b.id+':'+b.end+':'+a,at))])))result.escalated++;
   continue;
  }
  if(late>=CHECKOUT_WARN&&s<2){
   const next=await q(db,"SELECT MIN(start) start FROM bookings WHERE property_id=? AND id<>? AND status='confirmed' AND start>=?",b.property_id,b.id,Number(b.end)).first<Row>();
   const close=next?.start&&Number(next.start)-at<=NEXT_CLOSE?Number(next.start):0;
   const jobs=await rows(db,"SELECT id,assigned_to FROM cleaning_jobs WHERE booking_id=? AND status='assigned' AND assigned_to IS NOT NULL",b.id);
   if(moved(await db.batch([step(db,b.id,'checkout',Number(b.end),s,2,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,venueOr(b,'ИИ-администратор: гость ещё не сообщил о выезде из «'+title+'».'+(close?' Следующий заезд в '+clock(close)+' под угрозой.':'')+' Свяжитесь с гостем или подтвердите выезд, если жильё свободно.','ИИ-администратор: гость ещё не сообщил '+wordsOf(b).ofLeave+' в «'+title+'».'+(close?' Следующая бронь в '+clock(close)+' под угрозой.':'')+' Свяжитесь с гостем или подтвердите '+wordsOf(b).leaveLow+', если гости ушли.'),'owner:stay-checkout-late:'+b.id+':'+b.end,at),
    ...jobs.map(j=>notice(db,j.assigned_to,'ИИ-администратор: гость ещё в «'+title+'», начало уборки может сдвинуться. Я сообщу, когда '+venueOr(b,'жильё','место')+' освободится.','cleaner:stay-checkout-late:'+j.id+':'+b.end,at)),
    ...(close?admin.map(a=>notice(db,a,venueOr(b,'Гость не выехал из «'+title+'», следующий заезд в '+clock(close)+'. Проверьте ситуацию.','Гость не освободил «'+title+'», следующая бронь в '+clock(close)+'. Проверьте ситуацию.'),'admin:stay-checkout-next:'+b.id+':'+b.end+':'+a,at)):[])])))result.warned++;
   continue;
  }
  if(s<1&&moved(await db.batch([step(db,b.id,'checkout',Number(b.end),s,1,at),
   q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,venueOr(b,'ИИ-администратор: время выезда из «'+title+'» наступило. Нажмите «Сообщить о выезде», когда освободите жильё, или предложите владельцу продлить проживание в брони.','ИИ-администратор: время брони «'+title+'» закончилось. Нажмите «Сообщить '+wordsOf(b).ofLeave+'», когда уйдёте, или предложите владельцу продлить время в брони.'),'guest:stay-checkout-remind:'+b.id+':'+b.end,at)])))result.reminded++;
 }
}

export async function sweepStays(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const at=epoch(),result={reminded:0,warned:0,released:0,escalated:0},rule=rulesOf(db);
 await payments(db,at,result,rule);
 await arrivals(db,at,result,rule);
 await emptyEnded(db,at,result);
 await checkouts(db,at,result,admins(config),rule);
 return result;
}

// A request the owner left without an answer: the guest gets up to three similar homes free on the same dates,
// in the same city, at a price near the one asked for. Text only, so it fits the notice the guest already gets.
export async function similarFree(db:D1Database,bookingId:string,limit=3){
 const b=await q(db,'SELECT b.property_id,b.start,b.end,b.guests,p.city,p.price FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?',bookingId).first<Row>();
 if(!b)return [];
 const list:Row[]=await rows(db,`SELECT p.id,p.title,p.price FROM properties p WHERE p.id<>?1 AND p.city=?2 AND p.published=1 AND p.archived_at IS NULL AND p.capacity>=?3
  AND p.price BETWEEN ?4 AND ?5
  AND NOT EXISTS(SELECT 1 FROM bookings o WHERE o.property_id=p.id AND (o.status='confirmed' OR (o.status='requested' AND o.expires_at>unixepoch())) AND o.start<?7 AND o.occupied_until>?6)
  ORDER BY ABS(p.price-?8),p.id LIMIT ?9`,b.property_id,b.city,Number(b.guests)||1,Math.floor(Number(b.price)*0.7),Math.ceil(Number(b.price)*1.3),Number(b.start),Number(b.end),Number(b.price),limit*4);
 // The same check a booking makes: a home busy in its external calendar, or whose calendar is not fresh, is not offered.
 const free:Row[]=[];
 for(const p of list){if(free.length>=limit)break;try{await assertCalendarAvailable(db,p.id,Number(b.start),Number(b.end));free.push(p);}catch{/* busy elsewhere */}}
 return free;
}
export function similarText(list:Row[]){
 if(!list.length)return '';
 return ' Похожие свободные варианты на эти даты: '+list.map(p=>'«'+p.title+'»').join(', ')+'. Найдите их на карте.';
}
