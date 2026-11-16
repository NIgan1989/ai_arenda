import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {sweepOverdueJobs,LATE_ASK,LATE_RELEASE}=await load('overdue-cleaning');
const {adminApproveProperty}=await load('participant-security');
const {RentalService}=await load('service');
const job=f=>f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
const op=f=>f.db.raw.prepare('SELECT * FROM property_operations WHERE property_id=?').get(f.property);
const note=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').get(user,like);
// The fixture's stay, moved so that it ended `ago` seconds ago with its cleaning assigned to the cleaner.
function endedStay(f,ago){
 const t=now();
 f.db.raw.prepare('UPDATE bookings SET start=?,"end"=?,occupied_until=? WHERE id=?').run(t-7200,t-ago,t-ago+5400,f.booking);
 f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned',start=?,end=? WHERE id=?").run(t-ago,t-ago+5400,f.job.id);
 f.db.raw.prepare("INSERT INTO applications VALUES ('app-1',?,'cleaner','accepted',?)").run(f.job.id,t-9000);
}

test('a flat approved by the platform is ready for its first guest without the readiness form',async()=>{
 const f=await fixture();try{
  assert.equal(op(f).readiness,'inspection');
  await adminApproveProperty(new RentalService(f.db,'admin'),{propertyId:f.property});
  assert.equal(op(f).readiness,'ready');
 }finally{f.db.close();}
});

test('«Жильё готово» is one tap: no note and no version to send',async()=>{
 const f=await fixture();try{
  const r=await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});
  assert.match(r.message,/Готовность жилья подтверждена/);assert.equal(op(f).readiness,'ready');
  await assert.rejects(f.owner.readinessAction(f.property,{readiness:'maintenance'}),/Результат проверки или причина/);
 }finally{f.db.close();}
});

test('a checkout confirmed late keeps the assigned cleaner and moves the cleaning to now',async()=>{
 const f=await fixture();try{
  endedStay(f,1200);
  const before=job(f);
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  const j=job(f);
  assert.equal(j.status,'assigned');assert.equal(j.assigned_to,'cleaner');
  assert.ok(Math.abs(j.start-now())<5);assert.equal(j.end-j.start,before.end-before.start);
  assert.match(note(f,'cleaner','cleaner:checkout-shift:%').body,/остаётся за вами/);
  assert.equal(f.db.raw.prepare("SELECT status FROM applications WHERE id='app-1'").get().status,'accepted');
 }finally{f.db.close();}
});

test('a late checkout still releases the cleaner when the new time clashes with another cleaning',async()=>{
 const f=await fixture();try{
  endedStay(f,1200);const t=now();
  f.db.raw.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) VALUES ('other','"+f.property+"','owner',NULL,?,?,3000,'Другая','open',NULL,'[]','',?)").run(t+4300,t+5000,t);
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned' WHERE id='other'").run();
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  const j=job(f);assert.equal(j.status,'open');assert.equal(j.assigned_to,null);
  assert.ok(note(f,'cleaner','cleaner:checkout-reschedule:%'));
 }finally{f.db.close();}
});

test('the cleaner at the door says the guest is gone; the owner confirms in one tap and the cleaning starts',async()=>{
 const f=await fixture();try{
  endedStay(f,300);
  await assert.rejects(f.guest.jobAction(f.job.id,{action:'vacant'}),/Нет доступа/);
  const r=await f.cleaner.jobAction(f.job.id,{action:'vacant'});assert.match(r.message,/Владелец получил сообщение/);
  assert.ok(f.db.raw.prepare('SELECT checkout_reported_at FROM booking_terms WHERE booking_id=?').get(f.booking).checkout_reported_at);
  assert.match(note(f,'owner','owner:cleaner-vacant:%').body,/гостя нет/);
  assert.match(note(f,'guest','guest:cleaner-vacant:%').body,/напишите в чат брони/);
  assert.match((await f.cleaner.jobAction(f.job.id,{action:'vacant'})).message,/уже отмечен/);
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  await f.cleaner.jobAction(f.job.id,{action:'start'});assert.equal(job(f).status,'in_progress');
 }finally{f.db.close();}
});

test('«Жильё свободно» waits until the stay is about to end',async()=>{
 const f=await fixture();try{
  endedStay(f,-7200);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'vacant'}),/за полчаса/);
 }finally{f.db.close();}
});

test('a cleaner who has not started is asked at the start and replaced 45 minutes later',async()=>{
 const f=await fixture();try{
  endedStay(f,LATE_ASK+60);
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-LATE_ASK-60,f.booking);
  assert.equal((await sweepOverdueJobs(f.db,{})).reminded,1);
  assert.match(note(f,'cleaner','cleaner:late-start:%').body,/Вы в пути/);
  assert.match(note(f,'owner','owner:late-start:%').body,/найду замену/);
  assert.equal((await sweepOverdueJobs(f.db,{})).reminded,0);assert.equal(job(f).status,'assigned');
  const back=LATE_RELEASE+60;
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-back,now()-back+5400,f.job.id);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-back,f.booking);
  assert.equal((await sweepOverdueJobs(f.db,{})).released,1);
  const j=job(f);assert.equal(j.status,'open');assert.equal(j.assigned_to,null);
  assert.ok(note(f,'owner','owner:late-released:%'));
 }finally{f.db.close();}
});

test('«Опаздываю» moves the cleaning by half an hour once and stops the replacement clock',async()=>{
 const f=await fixture();try{
  endedStay(f,LATE_ASK+60);
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-LATE_ASK-60,f.booking);
  const r=await f.cleaner.jobAction(f.job.id,{action:'late'});assert.match(r.message,/Владелец предупреждён/);
  const j=job(f);assert.ok(j.start>=now()+1790);assert.equal(j.status,'assigned');
  assert.match(note(f,'owner','owner:cleaner-late:%').body,/опаздывает/);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'late'}),/уже предупреждали/);
  assert.equal((await sweepOverdueJobs(f.db,{})).released,0);assert.equal(job(f).assigned_to,'cleaner');
 }finally{f.db.close();}
});

test('a stay extension keeps the assigned cleaner at the new time',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned' WHERE id=?").run(f.job.id);
  const b=f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking);
  const quote=await f.guest.bookingChangeQuote(f.booking,'guest',{start:new Date(b.start*1000).toISOString(),end:new Date((b.end+3600)*1000).toISOString()});
  const proposal=await f.guest.proposeBookingChange(f.booking,'guest',{start:new Date(b.start*1000).toISOString(),end:new Date((b.end+3600)*1000).toISOString(),requestKey:'ext',expectedAmount:quote.amount,baseVersion:quote.baseVersion,policyVersion:quote.policyVersion,acceptTerms:true,reason:'Задержусь'});
  const r=await f.owner.decideBookingChange(f.booking,proposal.id,'owner',{action:'accept'});
  assert.match(r.message,/согласовано/);
  const j=job(f);assert.equal(j.assigned_to,'cleaner');assert.equal(j.status,'assigned');assert.equal(j.start,b.end+3600);
  assert.match(note(f,'cleaner','cleaner:reschedule:%').body,/остаётесь назначены/);
 }finally{f.db.close();}
});

test('«Опаздываю» is refused when another site\'s guest arrives right after the cleaning',async()=>{
 const f=await fixture();try{
  endedStay(f,LATE_ASK+60);const j=job(f);
  f.db.raw.prepare("INSERT INTO calendar_sources(id,property_id,owner_id,label,created_at) VALUES ('src',?,'owner','Другая площадка',?)").run(f.property,now());
  f.db.raw.prepare("INSERT INTO external_blocks VALUES ('blk','src',?,'uid-1',?,?)").run(f.property,j.end,j.end+86400);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'late'}),/внешнему календарю/);
  assert.equal(job(f).start,j.start);
 }finally{f.db.close();}
});

test('a short cleaning is still replaced 45 minutes after its start, though its window has ended',async()=>{
 const f=await fixture();try{
  endedStay(f,0);const back=LATE_RELEASE+60;
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-back,now()-back+1800,f.job.id);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now()-back,f.booking);
  assert.equal((await sweepOverdueJobs(f.db,{})).released,1);
  const j=job(f);assert.equal(j.status,'open');assert.equal(j.assigned_to,null);
 }finally{f.db.close();}
});
