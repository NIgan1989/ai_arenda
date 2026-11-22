// Nobody waits forever for a silent owner: the guest at the door, the cleaner's report, the cleaner's pay.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {sweepSilence,CHECKIN_WAIT,CHECKIN_HANDOVER,ACCEPT_WAIT,PAY_TELL,PAY_HANDOVER,CHECKOUT_WAIT,CHECKOUT_HANDOVER,MONEY_TELL,MONEY_HANDOVER}=await load('owner-silence');
const config={PLATFORM_ADMIN_IDS:'admin'};
const notes=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').all(user,like).map(n=>n.body);
async function arrived(f,ready,ago){
 await f.owner.bookingAction(f.booking,{action:'paid'});await f.owner.bookingAction(f.booking,{action:'deposit_received'});
 f.db.raw.prepare('UPDATE property_operations SET readiness=?').run(ready?'ready':'inspection');
 f.db.raw.prepare('UPDATE bookings SET start=?,created_at=? WHERE id=?').run(now()-ago-60,now()-7200,f.booking);
 const said=await f.guest.bookingAction(f.booking,{action:'report_checkin'});
 f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-ago,f.booking);
 return said;
}
const checkin=f=>f.db.raw.prepare('SELECT actual_checkin FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkin;

test('a paid guest at the door is checked in after ten minutes of the owner\'s silence',async()=>{
 const f=await fixture();try{
  assert.match((await arrived(f,true,CHECKIN_WAIT-60)).message,/ИИ-администратор подтвердит сам/);
  assert.equal((await sweepSilence(f.db,config)).checkedIn,0,'the owner still has time');assert.equal(checkin(f),null);
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-CHECKIN_WAIT-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).checkedIn,1);assert.ok(checkin(f));
  assert.equal(notes(f,'guest','guest:silence-checkin-done:%').length,1);assert.equal(notes(f,'owner','owner:silence-checkin-done:%').length,1);
  assert.equal((await sweepSilence(f.db,config)).checkedIn,0);
 }finally{f.db.close();}
});

test('a guest who has not paid is told to pay, and is not checked in',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(now()-60,f.booking);
  assert.match((await f.guest.bookingAction(f.booking,{action:'report_checkin'})).message,/Осталось перевести владельцу оплату по реквизитам из карточки брони и нажать «Я оплатил»/);
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-3600,f.booking);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0});
 }finally{f.db.close();}
});

test('a home not marked ready: the owner is asked at once, the service administrator after half an hour',async()=>{
 const f=await fixture();try{
  await arrived(f,false,CHECKIN_WAIT+5);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0});
  assert.match(notes(f,'owner','owner:silence-checkin-ask:%')[0],/Жильё готово/);assert.equal(notes(f,'guest','guest:silence-checkin-ask:%').length,1);
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-CHECKIN_HANDOVER-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);assert.equal(notes(f,'admin','admin:silence-checkin:%').length,1);
  assert.equal((await sweepSilence(f.db,config)).escalated,0,'said once');
  // The owner marks the home ready: the next round checks the guest in.
  await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});
  assert.equal((await sweepSilence(f.db,config)).checkedIn,1);assert.ok(checkin(f));
 }finally{f.db.close();}
});

async function submitted(f,ago,photos=true){
 await f.cleaner.jobAction(f.job.id,{action:'apply'});
 await f.owner.jobAction(f.job.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications').get().id});
 const at=now()-ago;
 f.db.raw.prepare("UPDATE bookings SET status='completed',start=?,end=?,occupied_until=? WHERE id=?").run(at-3*3600,at-5400,at,f.booking);
 f.db.raw.prepare("UPDATE cleaning_jobs SET status='submitted',start=?,end=?,report='Убрано' WHERE id=?").run(at-5400,at,f.job.id);
 f.db.raw.prepare('UPDATE cleaning_jobs SET submitted_at=? WHERE id=?').run(at,f.job.id);
 f.db.raw.prepare("UPDATE property_operations SET readiness='inspection',active_booking_id=NULL").run();
 if(photos)for(const [i,phase] of ['before','after','after'].entries())f.db.raw.prepare("INSERT INTO job_evidence(id,job_id,user_id,phase,data,object_key,width,height,bytes,note,created_at,mime,duration) VALUES (?,?,'cleaner',?,'x','',10,10,1,'',?,'image/jpeg',0)").run('e'+i,f.job.id,phase,at-600);
}
const job=f=>f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status;

test('a clean cleaning report is accepted after a day without the owner',async()=>{
 const f=await fixture();try{
  await submitted(f,ACCEPT_WAIT-600);
  assert.equal((await sweepSilence(f.db,config)).accepted,0);assert.equal(job(f),'submitted');
  f.db.raw.prepare('UPDATE cleaning_jobs SET submitted_at=? WHERE id=?').run(now()-ACCEPT_WAIT-5,f.job.id);
  assert.equal((await sweepSilence(f.db,config)).accepted,1);assert.equal(job(f),'completed');
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations').get().readiness,'ready');
  assert.equal(notes(f,'owner','owner:silence-accepted:%').length,1);assert.equal(notes(f,'cleaner','cleaner:approved:%').length,1);
 }finally{f.db.close();}
});

test('a report with remarks is not accepted: the cleaner is told and the service administrator called, once',async()=>{
 const f=await fixture();try{
  await submitted(f,ACCEPT_WAIT+5,false);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);assert.equal(job(f),'submitted');
  assert.match(notes(f,'admin','admin:silence-report:%')[0],/Замечания ИИ: нет фото «до»/);assert.equal(notes(f,'cleaner','cleaner:silence-report:%').length,1);
  assert.equal((await sweepSilence(f.db,config)).escalated,0);
 }finally{f.db.close();}
});

test('unpaid accepted cleaning: the cleaner hears after a day, the service administrator after three',async()=>{
 const f=await fixture();try{
  await submitted(f,3600);await f.owner.jobAction(f.job.id,{action:'approve'});
  assert.equal((await sweepSilence(f.db,config)).told,0);
  f.db.raw.prepare('UPDATE cleaning_jobs SET completed_at=?,end=? WHERE id=?').run(now()-PAY_TELL-5,now()-PAY_TELL-5,f.job.id);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:1,escalated:0});
  assert.match(notes(f,'cleaner','cleaner:silence-pay:%')[0],/3 000 ₸.*Не получил оплату/);
  // The button in the app: an issue from the cleaner, no text to type.
  assert.ok((await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Исполнитель не получил оплату 3 000 ₸ за уборку.'})).message);
  // A part the owner already paid is not asked for again.
  f.db.raw.prepare("INSERT INTO finance_entries(id,owner_id,property_id,booking_id,job_id,kind,amount,currency,source,external_reference,note,actor_id,request_key,created_at) VALUES ('part','owner',?,NULL,?,'job_payment',1000,'KZT','owner','','','owner','part',?)").run(f.property,f.job.id,now());
  f.db.raw.prepare('UPDATE cleaning_jobs SET completed_at=?,end=? WHERE id=?').run(now()-PAY_HANDOVER-5,now()-PAY_HANDOVER-5,f.job.id);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:1});
  assert.equal(notes(f,'admin','admin:silence-pay:%').length,1);assert.match(notes(f,'owner','owner:silence-pay-escalated:%')[0],/Переведите исполнителю 2 000 ₸/);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0},'handed over once');
  await f.owner.jobAction(f.job.id,{action:'record_job_payment',confirmed:true,expectedVersion:f.db.raw.prepare('SELECT version FROM cleaning_jobs WHERE id=?').get(f.job.id).version});
  f.db.raw.prepare("DELETE FROM notifications WHERE dedupe LIKE '%silence-pay%'").run();
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0},'a paid cleaning is not asked about');
 }finally{f.db.close();}
});

// The guest left, the money the owner holds for the guest.
const terms=f=>f.db.raw.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking);
async function left(f,ago){
 await arrived(f,true,7200);await f.owner.bookingAction(f.booking,{action:'checkin'});
 const said=await f.guest.bookingAction(f.booking,{action:'report_checkout'});
 f.db.raw.prepare('UPDATE booking_terms SET checkout_reported_at=? WHERE booking_id=?').run(now()-ago,f.booking);
 return said;
}

test('a guest who said they left is checked out after half an hour of the owner\'s silence',async()=>{
 const f=await fixture();try{
  assert.match((await left(f,CHECKOUT_WAIT-60)).message,/ИИ-администратор подтвердит сам/);
  assert.equal((await sweepSilence(f.db,config)).checkedOut,0,'the owner still has time');
  f.db.raw.prepare('UPDATE booking_terms SET checkout_reported_at=? WHERE booking_id=?').run(now()-CHECKOUT_WAIT-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).checkedOut,1);
  assert.ok(terms(f).actual_checkout);assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'completed');
  assert.notEqual(f.db.raw.prepare('SELECT readiness FROM property_operations').get().readiness,'occupied');
  assert.match(notes(f,'owner','owner:silence-checkout-done:%')[0],/верните депозит/);assert.equal(notes(f,'guest','guest:silence-checkout-done:%').length,1);
  assert.equal((await sweepSilence(f.db,config)).checkedOut,0);
 }finally{f.db.close();}
});

test('a checkout the owner disputed is left alone',async()=>{
 const f=await fixture();try{
  await left(f,CHECKOUT_WAIT+5);await f.owner.bookingAction(f.booking,{action:'dispute_checkout',reason:'Гость ещё в жилье'});
  assert.equal((await sweepSilence(f.db,config)).checkedOut,0);assert.equal(terms(f).actual_checkout,null);
 }finally{f.db.close();}
});

test('a checkout that cannot be confirmed goes to the service administrator after two hours',async()=>{
 const f=await fixture();try{
  await left(f,CHECKOUT_WAIT+5);f.db.raw.exec("PRAGMA foreign_keys=OFF;UPDATE property_operations SET active_booking_id='other';PRAGMA foreign_keys=ON");
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0});
  f.db.raw.prepare('UPDATE booking_terms SET checkout_reported_at=? WHERE booking_id=?').run(now()-CHECKOUT_HANDOVER-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);assert.equal(notes(f,'admin','admin:silence-checkout:%').length,1);
  assert.equal((await sweepSilence(f.db,config)).escalated,0,'handed over once');
 }finally{f.db.close();}
});

test('a deposit not returned: the guest hears after a day, the service administrator after three',async()=>{
 const f=await fixture();try{
  await left(f,60);await f.owner.bookingAction(f.booking,{action:'checkout'});
  assert.equal((await sweepSilence(f.db,config)).told,0,'the owner has a day');
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-MONEY_TELL-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).told,1);
  assert.match(notes(f,'guest','guest:silence-deposit:%')[0],/возврат депозита .*₸/);assert.match(notes(f,'owner','owner:silence-deposit:%')[0],/«Вернул депозит»/);
  assert.equal((await sweepSilence(f.db,config)).told,0);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-MONEY_HANDOVER-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);assert.equal(notes(f,'admin','admin:silence-deposit:%').length,1);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0});
 }finally{f.db.close();}
});

test('a returned deposit is never asked about',async()=>{
 const f=await fixture();try{
  await left(f,60);await f.owner.bookingAction(f.booking,{action:'checkout'});
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-MONEY_HANDOVER-5,f.booking);
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0});
 }finally{f.db.close();}
});

test('a refund after a cancellation counts from the first sweep that saw it',async()=>{
 const f=await fixture();try{
  await f.owner.bookingAction(f.booking,{action:'paid'});
  await f.owner.bookingAction(f.booking,{action:'cancel',reason:'Ремонт'});
  assert.equal(terms(f).refund_recorded_at,null);
  assert.equal((await sweepSilence(f.db,config)).told,0);assert.equal((await sweepSilence(f.db,config)).told,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='silence.money_seen'").get().n,1);
  f.db.raw.prepare("UPDATE audit_events SET created_at=? WHERE action='silence.money_seen'").run(now()-MONEY_TELL-5);
  assert.equal((await sweepSilence(f.db,config)).told,1);assert.match(notes(f,'guest','guest:silence-refund:%')[0],/возврат оплаты по отменённой брони/);
  f.db.raw.prepare("UPDATE audit_events SET created_at=? WHERE action='silence.money_seen'").run(now()-MONEY_HANDOVER-5);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);assert.equal(notes(f,'admin','admin:silence-refund:%').length,1);
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version});
  assert.deepEqual(await sweepSilence(f.db,config),{checkedIn:0,checkedOut:0,accepted:0,told:0,escalated:0});
 }finally{f.db.close();}
});

test('with no service administrator the cleaner is not told the report was handed over, and it is handed over once one is set',async()=>{
 const f=await fixture();try{
  await submitted(f,ACCEPT_WAIT+60,false);
  assert.equal((await sweepSilence(f.db,{})).escalated,0);
  assert.match(notes(f,'cleaner','cleaner:silence-report-wait:%')[0],/напомнил/);assert.equal(notes(f,'cleaner','cleaner:silence-report:%').length,0);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);assert.equal(notes(f,'cleaner','cleaner:silence-report:%').length,1);
 }finally{f.db.close();}
});

// Audit «Запуск» 2026-11-22, point 1: the guest at the door already said «Я оплатил» and the owner is silent.
test('a guest at the door with a transfer on review is not asked to pay again, can call for help and reaches the administrator',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE bookings SET start=?,created_at=? WHERE id=?').run(now()+300,now()-7200,f.booking);
  await f.guest.bookingAction(f.booking,{action:'report_paid'});
  const said=await f.guest.bookingAction(f.booking,{action:'report_checkin'});
  assert.match(said.message,/перевод на проверке/);assert.doesNotMatch(said.message,/перевести владельцу/);
  const help=await f.guest.bookingAction(f.booking,{action:'door_help'});
  assert.match(help.message,/Платить заново не нужно/);
  assert.match(notes(f,'owner','owner:door-help:%')[0],/Срочно: гость ждёт/);
  assert.match((await f.guest.bookingAction(f.booking,{action:'door_help'})).message,/уже знают/,'said once');
  assert.ok(f.db.raw.prepare("SELECT 1 FROM administrator_issues WHERE entity_id=? AND description LIKE 'Гость у двери%'").get(f.booking),'the service administrator sees the appeal');
  // The owner stays silent: asked after ten minutes, the administrator called after half an hour. The access stays closed.
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-CHECKIN_WAIT-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).escalated,0);
  assert.equal(notes(f,'owner','owner:silence-transfer-ask:%').length,1);assert.match(notes(f,'guest','guest:silence-transfer-ask:%')[0],/платить заново не нужно/);
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-CHECKIN_HANDOVER-5,f.booking);
  assert.equal((await sweepSilence(f.db,config)).escalated,1);
  assert.equal(notes(f,'admin','admin:silence-transfer:%').length,1);assert.equal(checkin(f),null);
  assert.equal((await sweepSilence(f.db,config)).escalated,0,'once');
 }finally{f.db.close();}
});
test('«Не могу попасть» is only for a transfer on review',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(now()+300,f.booking);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'door_help'}),/нажмите «Я оплатил»/);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'door_help'}),e=>e.status===403);
 }finally{f.db.close();}
});
test('a prepayment reported while the deposit is still unpaid: the guest is asked for the rest, not told to wait',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE booking_terms SET prepay_percent=30 WHERE booking_id=?').run(f.booking);
  f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(now()+3600,f.booking);
  await f.guest.bookingAction(f.booking,{action:'report_paid'});
  f.db.raw.prepare('UPDATE bookings SET start=?,created_at=? WHERE id=?').run(now()+300,now()-7200,f.booking);
  assert.doesNotMatch((await f.guest.bookingAction(f.booking,{action:'report_checkin'})).message,/перевод на проверке/);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'door_help'}),/всё, что осталось/);
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-CHECKIN_WAIT-5,f.booking);
  await sweepSilence(f.db,config);assert.equal(notes(f,'owner','owner:silence-transfer-ask:%').length,0);
 }finally{f.db.close();}
});
