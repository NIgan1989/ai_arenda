import {stayWords,wordsOf,venueOr,TYPE_SQL} from './stay-words';
import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';
import {RentalService} from './service';
import {DomainError} from './domain';
import {reviewCleaning} from './cleaning-review';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Nobody waits forever for an owner who is silent, with the autopilot or without it. Three places where a
// process used to stop for good: the guest at the door, the guest who left, the cleaner's report, the cleaner's pay,
// the guest's deposit and the refund after a cancellation. Each has a
// time after which the AI administrator acts by itself or calls the service administrator; each notice is said once.
export const CHECKIN_WAIT=600,CHECKIN_HANDOVER=1800,ACCEPT_WAIT=24*3600,PAY_TELL=24*3600,PAY_HANDOVER=72*3600,
 CHECKOUT_WAIT=1800,CHECKOUT_HANDOVER=7200,MONEY_TELL=24*3600,MONEY_HANDOVER=72*3600;
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const tenge=(n:number)=>Number(n).toLocaleString('ru-RU').replace(/ | /g,' ')+' ₸';
const said=(r:D1Result[])=>r.some(x=>!!x?.meta?.changes);

// The guest paid, came and said so. Ten minutes later the check-in is confirmed for the owner. A home that is not
// marked ready is the owner's to answer at once; half an hour after the guest's word the service administrator is called.
async function arrivals(db:D1Database,at:number,result:Row,admin:string[]){
 // Arrivals already asked about (the home is not ready) go after the ones not tried yet and take turns among
 // themselves, so fifty blocked homes never keep a ready home or a new guest out of the batch.
 const list=await rows(db,`SELECT b.id,b.guest_id,p.owner_id,p.title,${TYPE_SQL},t.checkin_reported_at reported,EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=b.guest_id AND n.dedupe='guest:silence-checkin-ask:'||b.id) asked FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.status='confirmed' AND b.end>? AND t.checkin_reported_at IS NOT NULL AND t.checkin_reported_at<=? AND t.actual_checkin IS NULL AND b.payment_status='owner_verified' AND t.deposit_status<>'pending' ORDER BY asked,CASE asked WHEN 0 THEN t.checkin_reported_at ELSE RANDOM() END LIMIT 50`,at,at-CHECKIN_WAIT);
 for(const b of list){
  const title=b.title||'жильё';
  try{
   await new RentalService(db,b.owner_id).bookingAction(b.id,{action:'checkin'});
   await db.batch([notice(db,b.owner_id,venueOr(b,'ИИ-администратор подтвердил заселение гостя в «'+title+'»: гость оплатил и сообщил, что он на месте.','ИИ-администратор отметил: '+wordsOf(b).guestIn.toLowerCase()+' в «'+title+'». Гость оплатил и сообщил, что он на месте.'),'owner:silence-checkin-done:'+b.id,at),
    notice(db,b.guest_id,venueOr(b,'ИИ-администратор подтвердил ваше заселение в «'+title+'». Хорошего отдыха!','ИИ-администратор подтвердил: '+wordsOf(b).youIn.toLowerCase()+' в «'+title+'».'+(wordsOf(b)===stayWords('banya')?' Хорошего отдыха!':'')),'guest:silence-checkin-done:'+b.id,at)]);
   result.checkedIn++;continue;
  }catch(error){if(!(error instanceof DomainError))throw error;}
  await db.batch([notice(db,b.owner_id,venueOr(b,'ИИ-администратор: гость оплатил и ждёт у «'+title+'», а жильё не отмечено готовым. Нажмите «Жильё готово» в карточке жилья, и заселение подтвердится само.','ИИ-администратор: гость оплатил и ждёт у «'+title+'», а готовность не отмечена. Нажмите «'+wordsOf(b).ready+'» в карточке брони, и всё подтвердится само.'),'owner:silence-checkin-ask:'+b.id,at),
   notice(db,b.guest_id,'ИИ-администратор: оплата получена. Ждём, когда владелец подтвердит, что «'+title+'» готово. Если он не ответит, подключится администратор сервиса.','guest:silence-checkin-ask:'+b.id,at)]);
  if(b.reported>at-CHECKIN_HANDOVER||!admin.length)continue;
  if(said(await db.batch(admin.map(a=>notice(db,a,venueOr(b,'Гость оплатил и больше получаса ждёт заселения в «'+title+'»: владелец не подтвердил готовность жилья. Свяжитесь с владельцем и гостем.','Гость оплатил и больше получаса ждёт у «'+title+'»: владелец не подтвердил готовность. Свяжитесь с владельцем и гостем.'),'admin:silence-checkin:'+b.id+':'+a,at))))){
   await notice(db,b.guest_id,venueOr(b,'ИИ-администратор передал ваше заселение в «'+title+'» администратору сервиса. С вами свяжутся.','ИИ-администратор передал вашу бронь «'+title+'» администратору сервиса. С вами свяжутся.'),'guest:silence-checkin-escalated:'+b.id,at).run();
   result.escalated++;
  }
 }
}

// The guest is at the door and said «Я оплатил», but the owner has not checked the transfer. Ten minutes later the
// owner is asked to look at the bank; half an hour after the guest's word the service administrator is called. The
// access stays closed: only the owner's «Деньги получены» opens it (audit «Запуск», point 1).
async function transfers(db:D1Database,at:number,result:Row,admin:string[]){
 const list=await rows(db,`SELECT b.id,b.guest_id,p.owner_id,p.title,${TYPE_SQL},t.checkin_reported_at reported,COALESCE(t.payment_reported_amount,0)+COALESCE(t.deposit_reported_amount,0) sum FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.status='confirmed' AND b.end>? AND t.checkin_reported_at IS NOT NULL AND t.checkin_reported_at<=? AND t.actual_checkin IS NULL
  AND (b.payment_status<>'owner_verified' OR t.deposit_status='pending') AND (t.payment_reported_at IS NOT NULL OR t.deposit_reported_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=b.guest_id AND n.dedupe='guest:silence-transfer-escalated:'||b.id)
  ORDER BY t.checkin_reported_at LIMIT 50`,at,at-CHECKIN_WAIT);
 for(const b of list){
  const title=b.title||'жильё';
  await db.batch([notice(db,b.owner_id,'ИИ-администратор: гость ждёт у «'+title+'» и сообщил о переводе '+tenge(b.sum)+'. Проверьте банк и нажмите в брони «Деньги получены» или «Перевод не пришёл».','owner:silence-transfer-ask:'+b.id,at),
   notice(db,b.guest_id,'ИИ-администратор: ваш перевод на проверке, платить заново не нужно. Я напомнил владельцу. Если он не ответит, подключится администратор сервиса.','guest:silence-transfer-ask:'+b.id,at)]);
  if(b.reported>at-CHECKIN_HANDOVER||!admin.length)continue;
  if(said(await db.batch(admin.map(a=>notice(db,a,'Гость больше получаса ждёт у «'+title+'»: сообщил о переводе '+tenge(b.sum)+', владелец не проверил деньги. Свяжитесь с владельцем и гостем.','admin:silence-transfer:'+b.id+':'+a,at))))){
   await notice(db,b.guest_id,'ИИ-администратор передал вашу бронь «'+title+'» администратору сервиса: владелец не проверил перевод. С вами свяжутся.','guest:silence-transfer-escalated:'+b.id,at).run();
   result.escalated++;
  }
 }
}

// A cleaning report nobody looked at for a day: a clean one is accepted for the owner, so the cleaner's work is
// closed and the home is ready; one with remarks goes to the service administrator, and the cleaner is told.
// A report already handed over leaves the list, so it never takes the place of the next ones.
async function reports(db:D1Database,at:number,result:Row,admin:string[]){
 const list=await rows(db,"SELECT j.*,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status='submitted' AND j.assigned_to IS NOT NULL AND COALESCE(j.submitted_at,j.end)<=? AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=j.assigned_to AND n.dedupe=?||j.id||':'||j.version) ORDER BY j.end LIMIT 50",at-ACCEPT_WAIT,admin.length?'cleaner:silence-report:':'cleaner:silence-report-wait:');
 for(const job of list){
  const title=job.title||'жильё',review=await reviewCleaning(db,job);
  if(review.ok){
   try{
    await new RentalService(db,job.owner_id).jobAction(job.id,{action:'approve',expectedVersion:job.version});
    await notice(db,job.owner_id,'ИИ-администратор принял уборку «'+title+'»: отчёт сутки ждал вашего ответа, фото и чек-лист в порядке. Жильё готово к заселению.','owner:silence-accepted:'+job.id,at).run();
    result.accepted++;continue;
   }catch(error){if(!(error instanceof DomainError))throw error;}
  }
  // Nobody to hand it to: the cleaner hears the truth under a key of its own, so the report is handed over
  // as soon as a service administrator is set.
  if(!admin.length){await notice(db,job.assigned_to,'ИИ-администратор: владелец больше суток не отвечает на ваш отчёт об уборке «'+title+'». Я напомнил ему. Если ответа нет, нажмите «Есть проблема» в задании.','cleaner:silence-report-wait:'+job.id+':'+job.version,at).run();
   await notice(db,job.owner_id,'ИИ-администратор: отчёт об уборке «'+title+'» ждёт вашего ответа больше суток. Примите уборку или напишите, что переделать.','owner:silence-report-wait:'+job.id+':'+job.version,at).run();continue;}
  const r=await db.batch([notice(db,job.assigned_to,'ИИ-администратор: владелец больше суток не отвечает на ваш отчёт об уборке «'+title+'». Вопрос передан администратору сервиса.','cleaner:silence-report:'+job.id+':'+job.version,at),
   ...admin.map(a=>notice(db,a,'Отчёт об уборке «'+title+'» больше суток ждёт владельца'+(review.ok?'':'. Замечания ИИ: '+review.findings.join('; '))+'. Свяжитесь с владельцем.','admin:silence-report:'+job.id+':'+job.version+':'+a,at))]);
  if(said(r))result.escalated++;
 }
}

// An accepted cleaning the owner has not marked as paid: after a day the cleaner hears what to do, after three
// the service administrator is called. Pay reserved on the owner's balance goes through the service and is not asked here.
async function pay(db:D1Database,at:number,result:Row,admin:string[]){
 // What is still owed: the fee less the payments the owner already recorded. A cleaning already told about waits
 // for the handover time outside the list, and one handed over leaves it for good.
 const PAID="COALESCE((SELECT SUM(f.amount) FROM finance_entries f WHERE f.job_id=j.id AND f.kind='job_payment'),0)";
 const list=await rows(db,`SELECT j.id,j.owner_id,j.assigned_to,j.fee-${PAID} owed,COALESCE(j.completed_at,j.end) done,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id
  WHERE j.status='completed' AND j.assigned_to IS NOT NULL AND j.assigned_to<>j.owner_id AND j.settled_at IS NULL AND j.fee-${PAID}>0
  AND NOT EXISTS(SELECT 1 FROM cleaning_holds h WHERE h.job_id=j.id AND h.status IN ('held','due','paid'))
  AND COALESCE(j.completed_at,j.end)<=?1 AND COALESCE(j.completed_at,j.end)>?2
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=j.assigned_to AND n.dedupe='cleaner:silence-pay-escalated:'||j.id)
  AND (?4=1 AND COALESCE(j.completed_at,j.end)<=?3 OR NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=j.assigned_to AND n.dedupe='cleaner:silence-pay:'||j.id))
  ORDER BY done LIMIT 100`,at-PAY_TELL,at-30*86400,at-PAY_HANDOVER,admin.length?1:0);
 for(const j of list){
  const title=j.title||'жильё';
  if(said(await db.batch([notice(db,j.assigned_to,'ИИ-администратор: владелец ещё не отметил оплату '+tenge(j.owed)+' за уборку «'+title+'». Если деньги не пришли, нажмите «Не получил оплату» в задании.','cleaner:silence-pay:'+j.id,at)])))result.told++;
  if(j.done>at-PAY_HANDOVER||!admin.length)continue;
  if(said(await db.batch(admin.map(a=>notice(db,a,'Исполнитель больше трёх суток ждёт оплату '+tenge(j.owed)+' за уборку «'+title+'»: владелец не отметил расчёт. Свяжитесь с владельцем.','admin:silence-pay:'+j.id+':'+a,at))))){
   await db.batch([notice(db,j.owner_id,'ИИ-администратор передал неоплаченную уборку «'+title+'» администратору сервиса. Переведите исполнителю '+tenge(j.owed)+' и нажмите «Оплатил уборку».','owner:silence-pay-escalated:'+j.id,at),
    notice(db,j.assigned_to,'ИИ-администратор передал оплату уборки «'+title+'» администратору сервиса.','cleaner:silence-pay-escalated:'+j.id,at)]);
   result.escalated++;
  }
 }
}

// The guest (or the cleaner at the door) said the home is free and the owner is silent. Half an hour later the
// checkout is confirmed for the owner, so the cleaning can start and the home stops being «occupied». The deposit
// stays the owner's decision. A checkout that cannot be confirmed goes to the service administrator after two hours.
async function departures(db:D1Database,at:number,result:Row,admin:string[]){
 const list=await rows(db,`SELECT b.id,b.guest_id,p.owner_id,p.title,${TYPE_SQL},t.checkout_reported_at reported,t.deposit_status FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.status='confirmed' AND t.checkout_reported_at IS NOT NULL AND t.checkout_reported_at<=? AND t.actual_checkout IS NULL
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=p.owner_id AND n.dedupe='owner:silence-checkout-escalated:'||b.id) ORDER BY t.checkout_reported_at LIMIT 50`,at-CHECKOUT_WAIT);
 for(const b of list){
  const title=b.title||'жильё';
  try{
   await new RentalService(db,b.owner_id).bookingAction(b.id,{action:'checkout'});
   await db.batch([notice(db,b.owner_id,venueOr(b,'ИИ-администратор подтвердил выезд гостя из «'+title+'»: гость сообщил о выезде, полчаса ответа не было.'+(b.deposit_status==='owner_verified'?' Проверьте жильё и верните депозит или удержите часть с причиной.':''),'ИИ-администратор подтвердил: '+wordsOf(b).swipeGuestOut+' из «'+title+'». Гость сообщил '+wordsOf(b).ofLeave+', полчаса ответа не было.'+(b.deposit_status==='owner_verified'?' Проверьте всё и верните депозит или удержите часть с причиной.':'')),'owner:silence-checkout-done:'+b.id,at),
    notice(db,b.guest_id,venueOr(b,'ИИ-администратор подтвердил ваш выезд из «'+title+'». Спасибо, что выбрали нас!'+(b.deposit_status==='owner_verified'?' Депозит владелец вернёт после проверки жилья.':''),'ИИ-администратор: «'+title+'», '+wordsOf(b).leaveOk.toLowerCase()+'. Спасибо, что выбрали нас!'+(b.deposit_status==='owner_verified'?' Депозит владелец вернёт после проверки.':'')),'guest:silence-checkout-done:'+b.id,at)]);
   result.checkedOut++;continue;
  }catch(error){if(!(error instanceof DomainError))throw error;}
  if(b.reported>at-CHECKOUT_HANDOVER||!admin.length)continue;
  if(said(await db.batch(admin.map(a=>notice(db,a,venueOr(b,'Гость больше двух часов назад сообщил о выезде из «'+title+'», выезд не подтверждён. Свяжитесь с владельцем.','Гость больше двух часов назад сообщил '+wordsOf(b).ofLeave+' в «'+title+'», владелец это не подтвердил. Свяжитесь с владельцем.'),'admin:silence-checkout:'+b.id+':'+a,at))))){
   await db.batch([notice(db,b.owner_id,venueOr(b,'ИИ-администратор передал выезд гостя из «'+title+'» администратору сервиса: гость сообщил о выезде, подтверждения нет.','ИИ-администратор передал бронь «'+title+'» администратору сервиса: гость сообщил '+wordsOf(b).ofLeave+', подтверждения нет.'),'owner:silence-checkout-escalated:'+b.id,at),
    notice(db,b.guest_id,venueOr(b,'ИИ-администратор передал ваш выезд из «'+title+'» администратору сервиса. Вам ничего делать не нужно.','ИИ-администратор передал вашу бронь «'+title+'» администратору сервиса. Вам ничего делать не нужно.'),'guest:silence-checkout-escalated:'+b.id,at)]);
   result.escalated++;
  }
 }
}

// Money the owner holds for the guest: the deposit after the stay and the refund after a cancellation. A day later
// the guest hears that it is remembered and the owner is reminded; after three days the service administrator is called.
// A stay counts from the checkout. A cancelled booking keeps no time of its own, so it counts from the first sweep that saw it.
const SUM=(kind:string)=>`(SELECT SUM(f.amount) FROM finance_entries f WHERE f.booking_id=b.id AND f.kind='${kind}')`;
const SEEN="(SELECT MIN(a.created_at) FROM audit_events a WHERE a.entity_id=b.id AND a.actor_id='ai-administrator' AND a.action='silence.money_seen')";
async function money(db:D1Database,at:number,result:Row,admin:string[]){
 const list=await rows(db,`SELECT b.id,b.guest_id,b.status,p.owner_id,p.title,t.deposit,t.deposit_status,t.deposit_kept,t.deposit_returned_at,t.paid_amount,t.refund_due,t.refund_recorded_at,
  ${SUM('deposit')} dep,COALESCE(${SUM('deposit_return')},0) depBack,${SUM('payment')} paid,COALESCE(${SUM('refund')},0) refunded,
  CASE WHEN b.status='completed' THEN COALESCE(t.actual_checkout,b.end) ELSE ${SEEN} END since
  FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.guest_id<>p.owner_id AND b.end>?1 AND (b.status IN ('completed','cancelled','expired') AND t.deposit_status='owner_verified' AND t.deposit_returned_at IS NULL
   OR b.status IN ('cancelled','expired') AND t.paid_amount>0 AND t.refund_recorded_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=b.guest_id AND n.dedupe IN ('guest:silence-deposit-escalated:'||b.id,'guest:silence-refund-escalated:'||b.id))
  AND (?2=1 OR NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=b.guest_id AND n.dedupe IN ('guest:silence-deposit:'||b.id,'guest:silence-refund:'||b.id)))
  ORDER BY b.end LIMIT 100`,at-60*86400,admin.length?1:0);
 for(const b of list){
  if(b.since==null){await q(db,"INSERT INTO audit_events VALUES (?,'ai-administrator',?,'silence.money_seen',?)",uuid(),b.id,at).run();continue;}
  if(b.since>at-MONEY_TELL)continue;
  const title=b.title||'жильё',late=b.since<=at-MONEY_HANDOVER&&admin.length>0;
  const deposit=b.deposit_status==='owner_verified'&&!b.deposit_returned_at?Math.max(0,Number(b.dep??b.deposit)-Number(b.depBack)-Number(b.deposit_kept||0)):0;
  const left=Number(b.paid??b.paid_amount)-Number(b.refunded);
  const refund=b.status!=='completed'&&b.paid_amount>0&&!b.refund_recorded_at?b.refund_due==null?Math.max(0,left):Math.min(left,Math.max(0,Number(b.refund_due)-Number(b.refunded))):0;
  for(const m of [{key:'deposit',sum:deposit,what:'возврат депозита',button:'«Вернул депозит»'+(b.status==='completed'?' в брони. Если есть повреждения, удержите часть и укажите причину':' в брони')},
   {key:'refund',sum:refund,what:'возврат оплаты по отменённой брони',button:'«Вернул гостю» в брони'}]){
   if(m.sum<=0)continue;
   if(said(await db.batch([notice(db,b.guest_id,'ИИ-администратор: владелец ещё не отметил '+m.what+' '+tenge(m.sum)+' за «'+title+'». Я напомнил ему.'+(admin.length?' Если деньги не придут за трое суток, подключится администратор сервиса.':''),'guest:silence-'+m.key+':'+b.id,at),
    notice(db,b.owner_id,'ИИ-администратор: гость ждёт '+m.what+' '+tenge(m.sum)+' за «'+title+'». Переведите деньги и нажмите '+m.button+'.','owner:silence-'+m.key+':'+b.id,at)])))result.told++;
   if(!late)continue;
   if(said(await db.batch(admin.map(a=>notice(db,a,'Гость больше трёх суток ждёт '+m.what+' '+tenge(m.sum)+' за «'+title+'»: владелец не отметил расчёт. Свяжитесь с владельцем.','admin:silence-'+m.key+':'+b.id+':'+a,at))))){
    await db.batch([notice(db,b.guest_id,'ИИ-администратор передал '+m.what+' '+tenge(m.sum)+' за «'+title+'» администратору сервиса. С вами свяжутся.','guest:silence-'+m.key+'-escalated:'+b.id,at),
     notice(db,b.owner_id,'ИИ-администратор передал '+m.what+' за «'+title+'» администратору сервиса. Переведите гостю '+tenge(m.sum)+' и нажмите '+m.button+'.','owner:silence-'+m.key+'-escalated:'+b.id,at)]);
    result.escalated++;
   }
  }
 }
}

export async function sweepSilence(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={},at=epoch()){
 const result={checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0},admin=admins(config);
 await departures(db,at,result,admin);
 await arrivals(db,at,result,admin);
 await transfers(db,at,result,admin);
 await reports(db,at,result,admin);
 await pay(db,at,result,admin);
 await money(db,at,result,admin);
 return result;
}
