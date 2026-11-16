import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';
import {RentalService} from './service';
import {DomainError} from './domain';
import {reviewCleaning} from './cleaning-review';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Nobody waits forever for an owner who is silent, with the autopilot or without it. Three places where a
// process used to stop for good: the guest at the door, the cleaner's report, the cleaner's pay. Each has a
// time after which the AI administrator acts by itself or calls the service administrator; each notice is said once.
export const CHECKIN_WAIT=600,CHECKIN_HANDOVER=1800,ACCEPT_WAIT=24*3600,PAY_TELL=24*3600,PAY_HANDOVER=72*3600;
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const tenge=(n:number)=>Number(n).toLocaleString('ru-RU').replace(/ | /g,' ')+' ₸';
const said=(r:D1Result[])=>r.some(x=>!!x?.meta?.changes);

// The guest paid, came and said so. Ten minutes later the check-in is confirmed for the owner. A home that is not
// marked ready is the owner's to answer at once; half an hour after the guest's word the service administrator is called.
async function arrivals(db:D1Database,at:number,result:Row,admin:string[]){
 const list=await rows(db,`SELECT b.id,b.guest_id,p.owner_id,p.title,t.checkin_reported_at reported FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.status='confirmed' AND b.end>? AND t.checkin_reported_at IS NOT NULL AND t.checkin_reported_at<=? AND t.actual_checkin IS NULL AND b.payment_status='owner_verified' AND t.deposit_status<>'pending' ORDER BY t.checkin_reported_at LIMIT 50`,at,at-CHECKIN_WAIT);
 for(const b of list){
  const title=b.title||'жильё';
  try{
   await new RentalService(db,b.owner_id).bookingAction(b.id,{action:'checkin'});
   await db.batch([notice(db,b.owner_id,'ИИ-администратор подтвердил заселение гостя в «'+title+'»: гость оплатил и сообщил, что он на месте.','owner:silence-checkin-done:'+b.id,at),
    notice(db,b.guest_id,'ИИ-администратор подтвердил ваше заселение в «'+title+'». Хорошего отдыха!','guest:silence-checkin-done:'+b.id,at)]);
   result.checkedIn++;continue;
  }catch(error){if(!(error instanceof DomainError))throw error;}
  await db.batch([notice(db,b.owner_id,'ИИ-администратор: гость оплатил и ждёт у «'+title+'», а жильё не отмечено готовым. Нажмите «Жильё готово» в карточке жилья, и заселение подтвердится само.','owner:silence-checkin-ask:'+b.id,at),
   notice(db,b.guest_id,'ИИ-администратор: оплата получена. Ждём, когда владелец подтвердит, что «'+title+'» готово. Если он не ответит, подключится администратор сервиса.','guest:silence-checkin-ask:'+b.id,at)]);
  if(b.reported>at-CHECKIN_HANDOVER||!admin.length)continue;
  if(said(await db.batch(admin.map(a=>notice(db,a,'Гость оплатил и больше получаса ждёт заселения в «'+title+'»: владелец не подтвердил готовность жилья. Свяжитесь с владельцем и гостем.','admin:silence-checkin:'+b.id+':'+a,at))))){
   await notice(db,b.guest_id,'ИИ-администратор передал ваше заселение в «'+title+'» администратору сервиса. С вами свяжутся.','guest:silence-checkin-escalated:'+b.id,at).run();
   result.escalated++;
  }
 }
}

// A cleaning report nobody looked at for a day: a clean one is accepted for the owner, so the cleaner's work is
// closed and the home is ready; one with remarks goes to the service administrator, and the cleaner is told.
// A report already handed over leaves the list, so it never takes the place of the next ones.
async function reports(db:D1Database,at:number,result:Row,admin:string[]){
 const list=await rows(db,"SELECT j.*,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status='submitted' AND j.assigned_to IS NOT NULL AND COALESCE(j.submitted_at,j.end)<=? AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=j.assigned_to AND n.dedupe='cleaner:silence-report:'||j.id||':'||j.version) ORDER BY j.end LIMIT 50",at-ACCEPT_WAIT);
 for(const job of list){
  const title=job.title||'жильё',review=await reviewCleaning(db,job);
  if(review.ok){
   try{
    await new RentalService(db,job.owner_id).jobAction(job.id,{action:'approve',expectedVersion:job.version});
    await notice(db,job.owner_id,'ИИ-администратор принял уборку «'+title+'»: отчёт сутки ждал вашего ответа, фото и чек-лист в порядке. Жильё готово к заселению.','owner:silence-accepted:'+job.id,at).run();
    result.accepted++;continue;
   }catch(error){if(!(error instanceof DomainError))throw error;}
  }
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

export async function sweepSilence(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={},at=epoch()){
 const result={checkedIn:0,accepted:0,told:0,escalated:0},admin=admins(config);
 await arrivals(db,at,result,admin);
 await reports(db,at,result,admin);
 await pay(db,at,result,admin);
 return result;
}
