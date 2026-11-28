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

test('the cleaner at the door only says what they see; the owner confirms the checkout and the cleaner hears «Можно начинать»',async()=>{
 const f=await fixture();try{
  endedStay(f,300);
  await assert.rejects(f.guest.jobAction(f.job.id,{action:'at_door'}),/Нет доступа/);
  const r=await f.cleaner.jobAction(f.job.id,{action:'at_door'});assert.match(r.message,/Сигнал «Можно начинать» придёт сюда/);
  const terms=()=>f.db.raw.prepare('SELECT checkout_reported_at,actual_checkout FROM booking_terms WHERE booking_id=?').get(f.booking);
  assert.equal(terms().checkout_reported_at,null,'the performer\'s word is not the guest\'s report');
  assert.ok(job(f).arrived_at);
  assert.match(note(f,'owner','owner:cleaner-at-door:%').body,/ждёт вашего сигнала/);
  assert.match(note(f,'guest','guest:cleaner-at-door:%').body,/Сообщить о выезде/);
  assert.match((await f.cleaner.jobAction(f.job.id,{action:'at_door'})).message,/уже знает/);
  // An older app build still sends «vacant»: it means the same and frees nothing.
  assert.match((await f.cleaner.jobAction(f.job.id,{action:'vacant'})).message,/уже знает/);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'start'}));
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  // The cleaning's time has come already: it is kept and starts now (the guest left after the planned start).
  assert.match(note(f,'cleaner','cleaner:checkout-shift:%').body,/начинается сейчас/);
  await f.cleaner.jobAction(f.job.id,{action:'start'});assert.equal(job(f).status,'in_progress');
 }finally{f.db.close();}
});

test('«Гость ещё здесь»: the owner chooses to wait half an hour or to let the cleaner go',async()=>{
 const f=await fixture();try{
  endedStay(f,300);
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'guest_here'}));
  const r=await f.cleaner.jobAction(f.job.id,{action:'guest_here'});assert.match(r.message,/решение придёт сюда/);
  assert.ok(job(f).guest_here_at);assert.match(note(f,'owner','owner:guest-here:%').body,/подождать 30 минут или отпустить/);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'wait_guest'}));
  const before=job(f);
  assert.match((await f.owner.jobAction(f.job.id,{action:'wait_guest'})).message,/подождёт/);
  const after=job(f);assert.ok(after.start>=Math.max(before.start,now())+1790);assert.equal(after.end-after.start,before.end-before.start);
  assert.equal(after.guest_here_at,null,'the cleaner can say it again');
  assert.match(note(f,'cleaner','cleaner:wait-guest:%').body,/подождать/);
  await f.cleaner.jobAction(f.job.id,{action:'guest_here'});
  assert.match((await f.owner.jobAction(f.job.id,{action:'let_go'})).message,/снова в поиске/);
  const free=job(f);assert.equal(free.status,'open');assert.equal(free.assigned_to,null);assert.equal(free.guest_here_at,null);assert.equal(free.arrived_at,null);
  assert.match(note(f,'cleaner','cleaner:let-go:%').body,/не считается вашим отказом/);
 }finally{f.db.close();}
});

test('the owner who gives no signal is asked again, then the service administrator is called',async()=>{
 const {sweepSilence}=await load('owner-silence');
 const f=await fixture();try{
  endedStay(f,300);
  await f.cleaner.jobAction(f.job.id,{action:'at_door'});
  const R=f.db.raw;R.prepare('UPDATE cleaning_jobs SET arrived_at=? WHERE id=?').run(now()-20*60,f.job.id);
  await sweepSilence(f.db,{PLATFORM_ADMIN_IDS:'admin'});
  assert.match(note(f,'owner','owner:door-wait:%').body,/ждёт у двери/);
  assert.equal(R.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:door-wait:%'").get().n,0);
  R.prepare('UPDATE cleaning_jobs SET arrived_at=? WHERE id=?').run(now()-35*60,f.job.id);
  await sweepSilence(f.db,{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(R.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:door-wait:%'").get().n,1);
  assert.match(note(f,'cleaner','cleaner:door-wait-escalated:%').body,/откажитесь от задания/);
  assert.equal(R.prepare('SELECT actual_checkout FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkout,null,'nobody frees the home on the performer\'s word');
 }finally{f.db.close();}
});

test('«Я на месте» waits until the stay is about to end; a checkout before the cleaning\'s time says «Можно начинать»',async()=>{
 const f=await fixture();try{
  endedStay(f,-7200);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'at_door'}),/за полчаса/);
  f.db.raw.prepare("DELETE FROM applications WHERE id='app-1'").run();endedStay(f,-600);
  await f.cleaner.jobAction(f.job.id,{action:'at_door'});
  assert.equal(note(f,'guest','guest:cleaner-at-door:%'),undefined,'before the end of the stay the guest is not disturbed');
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  assert.match(note(f,'cleaner','cleaner:checkout-go:%').body,/Можно начинать уборку .*подтвердил владелец/);
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
