import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';
import {arrivalDue} from './late-arrival';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// The AI administrator keeps a stay moving when a person is silent past a deadline. Every deadline follows the same
// ladder: remind → ask → act by the rule → hand over to a person. Each step is said once (stay_watch keeps how far it
// went), each notice goes to the AI journal of the person who gets it (lib/ai-move-marks.ts reads its key).
//
// Payment: three hours before it is due the guest is reminded, at the due time both sides are warned, thirty minutes
// later an unpaid stay is released and the home is free again. Payments are an imitation until the launch, so
// releasing takes no money and returns none; a stay paid in part is never released, the owner decides.
// Arrival: a paid guest who has not checked in is asked whether they are coming; with no answer the owner's
// autopilot releases the stay, without it the owner decides. «Задерживаюсь на час» moves the arrival and starts over.
// Checkout: at the end of the stay the guest is reminded, thirty minutes later the owner and the cleaner hear the
// guest is still there (the service admin too when the next guest is close), two hours later the service admin.

export const PAY_REMIND=3*3600,PAY_GRACE=1800,PAY_MIN_WINDOW=1800;
export const ARRIVAL_ASK={hourly:900,daily:3600},ARRIVAL_ACT={hourly:1800,daily:7200};
export const CHECKOUT_WARN=1800,CHECKOUT_ESCALATE=7200,NEXT_CLOSE=3*3600;

const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const hourly=(b:Row)=>b.billing_mode==='hourly'?'hourly':'daily';

// When the stay has to be paid: the arrival, but never sooner than half an hour after the request, so a stay booked
// for right now still leaves the guest time to pay.
export function payDue(b:{start:number;created_at:number}){return Math.max(Number(b.start),Number(b.created_at)+PAY_MIN_WINDOW);}
const STAY_SQL=`SELECT b.id,b.property_id,b.guest_id,b.start,b.end,b.created_at,b.payment_status,p.owner_id,p.title,
 t.billing_mode,t.paid_amount,t.actual_checkin,t.actual_checkout,t.checkin_reported_at,t.checkout_reported_at,t.arrival_eta,t.late_count,
 COALESCE(w.pay_step,0) pay_step,COALESCE(w.arrival_step,0) arrival_step,COALESCE(w.checkout_step,0) checkout_step,
 EXISTS(SELECT 1 FROM property_policies pp WHERE pp.property_id=b.property_id AND pp.auto_confirm=1 AND pp.auto_assign=1 AND (pp.mandate_until=0 OR pp.mandate_until>?1)) autopilot
 FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id LEFT JOIN stay_watch w ON w.booking_id=b.id`;

// The step is kept in one row per stay; a step is taken only by the sweep that moves it on.
const step=(db:D1Database,id:string,field:'pay_step'|'arrival_step'|'checkout_step',from:number,to:number,at:number)=>q(db,
 `INSERT INTO stay_watch(booking_id,${field},updated_at) VALUES (?1,?3,?4) ON CONFLICT(booking_id) DO UPDATE SET ${field}=?3,updated_at=?4 WHERE stay_watch.${field}=?2`,id,from,to,at);
const moved=(r:D1Result[])=>!!r[0]?.meta?.changes;

async function payments(db:D1Database,at:number,result:Row){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND b.payment_status<>'owner_verified' AND t.actual_checkin IS NULL AND b.end>?1
  AND COALESCE(w.pay_step,0)<3 ORDER BY b.start LIMIT 50`,at);
 for(const b of list){
  const due=payDue({start:b.start,created_at:b.created_at}),title=b.title||'жильё',s=Number(b.pay_step);
  if(at>=due+PAY_GRACE){
   if(Number(b.paid_amount)>0){
    // Paid in part: never released by the AI, the owner settles it.
    if(moved(await db.batch([step(db,b.id,'pay_step',s,3,at),q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,'ИИ-администратор: бронь «'+title+'» оплачена не полностью. Отметьте остаток оплаты или договоритесь с гостем в чате брони.','owner:stay-pay-part:'+b.id,at)])))result.warned++;
    continue;
   }
   const r=await db.batch([
    q(db,"UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed' AND payment_status<>'owner_verified' AND NOT EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND (actual_checkin IS NOT NULL OR paid_amount>0)) AND NOT EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)",b.id,b.id,b.property_id,b.id),
    q(db,"UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned') AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",b.id,b.id),
    step(db,b.id,'pay_step',s,3,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.guest_id,'ИИ-администратор снял бронь «'+title+'»: оплата не поступила в срок. Если жильё ещё свободно, его можно забронировать заново.','guest:stay-unpaid-released:'+b.id,at,b.id),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.owner_id,'ИИ-администратор снял неоплаченную бронь «'+title+'». Жильё снова свободно на эти даты.','owner:stay-unpaid-released:'+b.id,at,b.id),
    q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'booking.unpaid_released',? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.id,at,b.id)]);
   if(r[0].meta.changes)result.released++;
   continue;
  }
  if(at>=due&&s<2){
   if(moved(await db.batch([step(db,b.id,'pay_step',s,2,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,'ИИ-администратор: бронь «'+title+'» не оплачена. Оплатите до '+clock(due+PAY_GRACE)+', иначе бронь снимется и жильё станет свободным.','guest:stay-pay-warn:'+b.id,at),
    notice(db,b.owner_id,'ИИ-администратор: гость не оплатил бронь «'+title+'». Если оплата получена, отметьте её в брони. Иначе в '+clock(due+PAY_GRACE)+' я сниму бронь.','owner:stay-pay-warn:'+b.id,at)])))result.warned++;
   continue;
  }
  // The reminder makes sense only when there is time left to pay before the warning.
  if(at>=due-PAY_REMIND&&at<due&&s<1&&due-PAY_REMIND>Number(b.created_at)){
   if(moved(await db.batch([step(db,b.id,'pay_step',s,1,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,'ИИ-администратор: оплатите бронь «'+title+'» до '+clock(due)+'. Без оплаты бронь снимется через 30 минут после этого времени.','guest:stay-pay-remind:'+b.id,at)])))result.reminded++;
  }
 }
}

async function arrivals(db:D1Database,at:number,result:Row){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND b.payment_status='owner_verified' AND t.actual_checkin IS NULL AND t.checkin_reported_at IS NULL
  AND t.actual_checkout IS NULL AND b.end>?1 AND MAX(b.start,COALESCE(t.arrival_eta,0))<=?1 AND COALESCE(w.arrival_step,0)<2 ORDER BY b.start LIMIT 50`,at);
 for(const b of list){
  const due=arrivalDue({start:b.start,arrival_eta:b.arrival_eta}),kind=hourly(b),title=b.title||'жильё',s=Number(b.arrival_step),actAt=due+ARRIVAL_ACT[kind];
  if(at>=actAt){
   if(Number(b.autopilot)){
    const r=await db.batch([
     q(db,"UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed' AND NOT EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=? AND (actual_checkin IS NOT NULL OR checkin_reported_at IS NOT NULL OR COALESCE(arrival_eta,0)<>?)) AND NOT EXISTS(SELECT 1 FROM property_operations WHERE property_id=? AND active_booking_id=?)",b.id,b.id,Number(b.arrival_eta)||0,b.property_id,b.id),
     q(db,"UPDATE cleaning_jobs SET status='cancelled' WHERE booking_id=? AND status IN ('open','assigned') AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",b.id,b.id),
     step(db,b.id,'arrival_step',s,2,at),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.guest_id,'ИИ-администратор: вы не заселились в «'+title+'» и не ответили, бронь снята. Возврат оплаты решается по правилам отмены, напишите владельцу в чате брони.','guest:stay-no-show:'+b.id,at,b.id),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.owner_id,'ИИ-администратор: гость не приехал в «'+title+'» и не ответил. Я отметил неявку и освободил жильё. Возврат оплаты решаете вы по правилам отмены.','owner:stay-no-show:'+b.id,at,b.id),
     q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'booking.no_show_released',? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled')",uuid(),b.id,at,b.id)]);
    if(r[0].meta.changes){result.released++;continue;}
   }
   // Without the autopilot the owner decides: the guest may be there already and nobody pressed the button.
   if(moved(await db.batch([step(db,b.id,'arrival_step',s,2,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,'ИИ-администратор: гость так и не заселился в «'+title+'» и не ответил. Если он на месте, подтвердите заселение; если не приедет, отмените бронь в карточке.','owner:stay-no-show-ask:'+b.id+':'+due,at)])))result.warned++;
   continue;
  }
  if(at>=due+ARRIVAL_ASK[kind]&&s<1){
   if(moved(await db.batch([step(db,b.id,'arrival_step',s,1,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,'ИИ-администратор: вы едете в «'+title+'»? Если задерживаетесь, нажмите «Задерживаюсь на час» в брони; если уже на месте, нажмите «Я заселился». Без ответа до '+clock(actAt)+' бронь может быть снята.','guest:stay-arrival-ask:'+b.id+':'+due,at),
    notice(db,b.owner_id,'ИИ-администратор: гость ещё не заселился в «'+title+'». Я спросил, едет ли он.','owner:stay-arrival-ask:'+b.id+':'+due,at)])))result.reminded++;
  }
 }
}

async function checkouts(db:D1Database,at:number,result:Row,admin:string[]){
 const list:Row[]=await rows(db,STAY_SQL+` WHERE b.status='confirmed' AND b.end<=?1 AND t.actual_checkout IS NULL AND t.checkout_reported_at IS NULL AND COALESCE(w.checkout_step,0)<3 ORDER BY b.end LIMIT 50`,at);
 for(const b of list){
  const title=b.title||'жильё',s=Number(b.checkout_step),late=at-Number(b.end);
  if(late>=CHECKOUT_ESCALATE&&s<3){
   if(moved(await db.batch([step(db,b.id,'checkout_step',s,3,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,'ИИ-администратор передал задержку выезда из «'+title+'» администратору сервиса. Подтвердите выезд, как только жильё освободится.','owner:stay-checkout-escalated:'+b.id,at),
    ...admin.map(a=>notice(db,a,'Гость не выехал из «'+title+'» больше 2 часов после конца брони и не ответил. Свяжитесь с владельцем и гостем.','admin:stay-checkout:'+b.id+':'+a,at))])))result.escalated++;
   continue;
  }
  if(late>=CHECKOUT_WARN&&s<2){
   const next=await q(db,"SELECT MIN(start) start FROM bookings WHERE property_id=? AND id<>? AND status='confirmed' AND start>=?",b.property_id,b.id,Number(b.end)).first<Row>();
   const close=next?.start&&Number(next.start)-at<=NEXT_CLOSE?Number(next.start):0;
   const jobs=await rows(db,"SELECT id,assigned_to FROM cleaning_jobs WHERE booking_id=? AND status='assigned' AND assigned_to IS NOT NULL",b.id);
   if(moved(await db.batch([step(db,b.id,'checkout_step',s,2,at),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.owner_id,'ИИ-администратор: гость ещё не сообщил о выезде из «'+title+'».'+(close?' Следующий заезд в '+clock(close)+' под угрозой.':'')+' Свяжитесь с гостем или подтвердите выезд, если жильё свободно.','owner:stay-checkout-late:'+b.id,at),
    ...jobs.map(j=>notice(db,j.assigned_to,'ИИ-администратор: гость ещё в «'+title+'», начало уборки может сдвинуться. Я сообщу, когда жильё освободится.','cleaner:stay-checkout-late:'+j.id,at)),
    ...(close?admin.map(a=>notice(db,a,'Гость не выехал из «'+title+'», следующий заезд в '+clock(close)+'. Проверьте ситуацию.','admin:stay-checkout-next:'+b.id+':'+a,at)):[])])))result.warned++;
   continue;
  }
  if(s<1&&moved(await db.batch([step(db,b.id,'checkout_step',s,1,at),
   q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),b.guest_id,'ИИ-администратор: время выезда из «'+title+'» наступило. Нажмите «Сообщить о выезде», когда освободите жильё, или предложите владельцу продлить проживание в брони.','guest:stay-checkout-remind:'+b.id,at)])))result.reminded++;
 }
}

export async function sweepStays(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const at=epoch(),result={reminded:0,warned:0,released:0,escalated:0};
 await payments(db,at,result);
 await arrivals(db,at,result);
 await checkouts(db,at,result,admins(config));
 return result;
}

// A request the owner left without an answer: the guest gets up to three similar homes free on the same dates,
// in the same city, at a price near the one asked for. Text only, so it fits the notice the guest already gets.
export async function similarFree(db:D1Database,bookingId:string,limit=3){
 const b=await q(db,'SELECT b.property_id,b.start,b.end,b.guests,p.city,p.price FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?',bookingId).first<Row>();
 if(!b)return [];
 return rows(db,`SELECT p.id,p.title,p.price FROM properties p WHERE p.id<>?1 AND p.city=?2 AND p.published=1 AND p.archived_at IS NULL AND p.capacity>=?3
  AND p.price BETWEEN ?4 AND ?5
  AND NOT EXISTS(SELECT 1 FROM bookings o WHERE o.property_id=p.id AND (o.status='confirmed' OR (o.status='requested' AND o.expires_at>unixepoch())) AND o.start<?7 AND o.occupied_until>?6)
  ORDER BY ABS(p.price-?8),p.id LIMIT ?9`,b.property_id,b.city,Number(b.guests)||1,Math.floor(Number(b.price)*0.7),Math.ceil(Number(b.price)*1.3),Number(b.start),Number(b.end),Number(b.price),limit);
}
export function similarText(list:Row[]){
 if(!list.length)return '';
 return ' Похожие свободные варианты на эти даты: '+list.map(p=>'«'+p.title+'»').join(', ')+'. Найдите их на карте.';
}
