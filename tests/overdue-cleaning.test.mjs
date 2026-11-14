import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {sweepOverdueJobs}=await load('overdue-cleaning');
const {overdueNote}=await load('overdue-text');
const job=f=>f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
const late=(f,status,end)=>{f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned',booking_id=NULL,start=?,end=? WHERE id=?").run(now()-7200,end,f.job.id);if(status==='in_progress')f.db.raw.prepare("UPDATE cleaning_jobs SET status='in_progress' WHERE id=?").run(f.job.id);};

test('an overdue cleaning tells each side what to do next',()=>{
 const t=now(),j={status:'in_progress',assigned_to:'c',end:t-10,overdue_step:1,checkout_confirmed:true};
 assert.match(overdueNote(j,'cleaner',t).text,/отправьте отчёт/);
 assert.match(overdueNote(j,'owner',t).ai,/напомнил исполнителю/);
 assert.match(overdueNote({...j,overdue_step:3},'owner',t).ai,/администратору сервиса/);
 assert.equal(overdueNote({...j,end:t+60},'owner',t),null);
 assert.equal(overdueNote({...j,status:'submitted'},'owner',t),null);
});
test('the AI reminds at the deadline, warns the owner after 30 minutes and calls the admin after 2 hours',async()=>{
 const f=await fixture();try{
  late(f,'in_progress',now()-60);
  assert.equal((await sweepOverdueJobs(f.db,{PLATFORM_ADMIN_IDS:'admin'})).reminded,1);
  assert.equal(job(f).overdue_step,1);assert.equal((await sweepOverdueJobs(f.db,{})).reminded,0);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='cleaner' AND dedupe LIKE 'cleaner:overdue-remind:%'").get());
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=?,overdue_step=1 WHERE id=?').run(now()-2400,f.job.id);
  assert.equal((await sweepOverdueJobs(f.db,{PLATFORM_ADMIN_IDS:'admin'})).warned,1);assert.equal(job(f).status,'in_progress');
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-7300,f.job.id);
  assert.equal((await sweepOverdueJobs(f.db,{PLATFORM_ADMIN_IDS:'admin'})).escalated,1);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='admin' AND dedupe LIKE 'admin:overdue-job:%'").get());
  assert.equal((await sweepOverdueJobs(f.db,{PLATFORM_ADMIN_IDS:'admin'})).escalated,0);
 }finally{f.db.close();}
});
test('a cleaning never started is returned to the search by the AI after 30 minutes of silence',async()=>{
 const f=await fixture();try{
  late(f,'assigned',now()-60);await sweepOverdueJobs(f.db,{});
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-1900,f.job.id);
  assert.equal((await sweepOverdueJobs(f.db,{})).released,1);
  const j=job(f);assert.equal(j.status,'open');assert.equal(j.assigned_to,null);assert.ok(j.end>now());
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:overdue-released:%'").get());
 }finally{f.db.close();}
});
test('the owner and the cleaner get a way out of an overdue cleaning',async()=>{
 const f=await fixture();try{
  late(f,'in_progress',now()-60);f.db.raw.prepare('UPDATE cleaning_jobs SET overdue_step=2 WHERE id=?').run(f.job.id);
  // The next guest arrives an hour after the fixture was made: two more hours would run into that arrival.
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'extend',minutes:120}),/Следующий заезд/);
  // One hour would end exactly at the arrival, or inside it after a tick of the clock: the arrival is moved clear.
  f.db.raw.prepare('UPDATE bookings SET start=start+3600,end=end+3600').run();
  assert.match((await f.cleaner.jobAction(f.job.id,{action:'extend',minutes:60})).message,/1 ч/);
  let j=job(f);assert.equal(j.overdue_step,0);assert.ok(j.end>=now()+3500);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'close',confirmed:true}),/Нет доступа/);
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'extend',minutes:45}),/30 минут/);
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-60,f.job.id);
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'close'}),/Подтвердите/);
  assert.match((await f.owner.jobAction(f.job.id,{action:'close',confirmed:true})).message,/закрыта/);
  j=job(f);assert.equal(j.status,'completed');assert.match(j.report,/Закрыто владельцем/);
 }finally{f.db.close();}
});
test('the cleaner can give an overdue task back and the owner can cancel it',async()=>{
 const f=await fixture();try{
  late(f,'in_progress',now()-60);
  assert.match((await f.cleaner.jobAction(f.job.id,{action:'release'})).message,/отказались/);
  assert.equal(job(f).status,'open');
  late(f,'in_progress',now()-60);
  await f.owner.jobAction(f.job.id,{action:'cancel',reason:'Сделали сами'});assert.equal(job(f).status,'cancelled');
 }finally{f.db.close();}
});
test('pressing «Есть проблема» again adds to the open issue instead of a second one',async()=>{
 const f=await fixture();try{
  late(f,'in_progress',now()+600);
  await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Нет ключа',requestKey:'a'});
  const second=await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Жду у двери',requestKey:'b'});
  assert.match(second.message,/Дополнение/);
  const issues=f.db.raw.prepare('SELECT * FROM administrator_issues').all();
  assert.equal(issues.length,1);assert.match(issues[0].description,/Нет ключа\nДополнение: Жду у двери/);
 }finally{f.db.close();}
});
test('an urgent addition to an open issue raises its priority and reaches the admin',async()=>{
 const f=await fixture();try{
  const {sweepIssues}=await load('admin-issues');
  late(f,'in_progress',now()+600);
  await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Хотим уточнить про оплату позже',requestKey:'a'});
  await sweepIssues(f.db,{PLATFORM_ADMIN_IDS:'admin'});
  const issue=f.db.raw.prepare('SELECT * FROM administrator_issues').get();
  assert.equal(f.db.raw.prepare('SELECT priority FROM operator_tickets WHERE issue_id=?').get(issue.id).priority,'high');
  await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Дверь не открывается, ключа нет',requestKey:'b'});
  assert.equal((await sweepIssues(f.db,{PLATFORM_ADMIN_IDS:'admin'})).escalated,1);
  assert.equal(f.db.raw.prepare('SELECT priority FROM operator_tickets WHERE issue_id=?').get(issue.id).priority,'urgent');
  assert.equal((await sweepIssues(f.db,{PLATFORM_ADMIN_IDS:'admin'})).triaged,0);
  await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Просто уточнение',requestKey:'c'});await sweepIssues(f.db,{});
  assert.equal(f.db.raw.prepare('SELECT priority FROM operator_tickets WHERE issue_id=?').get(issue.id).priority,'urgent');
 }finally{f.db.close();}
});
test('a cleaning back in the search never runs into the next confirmed arrival',async()=>{
 const f=await fixture();try{
  const {releaseWindow}=await load('overdue-cleaning');
  late(f,'in_progress',now()-60);const j=job(f),t=now();
  f.db.raw.prepare("UPDATE bookings SET start=?,status='confirmed' WHERE id=?").run(t+2400,f.booking);
  assert.equal((await releaseWindow(f.db,j,t)).end,t+2400);
  f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(t+600,f.booking);
  assert.equal(await releaseWindow(f.db,j,t),null);
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'release'}),/меньше получаса/);
 }finally{f.db.close();}
});

// Nobody took the cleaning before its end (the case from 14 November: an open cleaning past its time, no buttons, the AI silent).
const unclaimed=(f,end)=>{f.db.raw.prepare("UPDATE cleaning_jobs SET status='open',assigned_to=NULL,booking_id=NULL,overdue_step=0,start=?,end=? WHERE id=?").run(end-5400,end,f.job.id);f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);};
test('an open cleaning past its time gives the owner a way out',()=>{
 const t=now(),j={status:'open',assigned_to:null,end:t-10,overdue_step:0};
 assert.match(overdueNote(j,'owner',t).title,/Срок уборки прошёл/);
 assert.match(overdueNote({...j,overdue_step:2},'owner',t).ai,/ждёт вашего решения/);
 assert.equal(overdueNote(j,'cleaner',t),null);
 assert.equal(overdueNote({...j,end:t+60},'owner',t),null);
});
test('with the autopilot on, the AI gives an unclaimed cleaning one new window, then hands it to the owner',async()=>{
 const f=await fixture();try{
  unclaimed(f,now()-60);
  f.db.raw.prepare('INSERT INTO operation_rules(property_id,auto_offers,auto_replace,require_photos,offer_minutes,version,updated_at) VALUES (?,1,0,0,10,1,?) ON CONFLICT(property_id) DO UPDATE SET auto_offers=1').run(f.property,now());
  assert.equal((await sweepOverdueJobs(f.db,{})).reposted,1);
  let j=job(f);assert.equal(j.status,'open');assert.equal(j.overdue_step,1);assert.ok(j.end>now());
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:unclaimed-reposted:%'").get());
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-60,f.job.id);
  const second=await sweepOverdueJobs(f.db,{});assert.equal(second.reposted,0);assert.equal(second.unclaimed,1);
  assert.equal(job(f).overdue_step,2);assert.equal((await sweepOverdueJobs(f.db,{})).unclaimed,0);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:unclaimed:%'").get());
 }finally{f.db.close();}
});
test('without the autopilot, or with a guest already inside, the AI only tells the owner',async()=>{
 const f=await fixture();try{
  unclaimed(f,now()-700);
  f.db.raw.prepare("UPDATE bookings SET status='confirmed',start=?,end=? WHERE id=?").run(now()-600,now()+3600,f.booking);
  f.db.raw.prepare('INSERT INTO operation_rules(property_id,auto_offers,auto_replace,require_photos,offer_minutes,version,updated_at) VALUES (?,1,0,0,10,1,?) ON CONFLICT(property_id) DO UPDATE SET auto_offers=1').run(f.property,now());
  const r=await sweepOverdueJobs(f.db,{});assert.equal(r.reposted,0);assert.equal(r.unclaimed,1);
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'repost'}),/гость уже в жилье/);
 }finally{f.db.close();}
});
test('the owner looks again on a new window or closes a cleaning done without a cleaner',async()=>{
 const f=await fixture();try{
  unclaimed(f,now()-60);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'repost'}));
  assert.match((await f.owner.jobAction(f.job.id,{action:'repost'})).message,/снова в поиске/);
  let j=job(f);assert.ok(j.end>now());assert.equal(j.status,'open');
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'repost'}),/ещё не прошёл/);
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-60,f.job.id);
  await assert.rejects(f.owner.jobAction(f.job.id,{action:'close'}),/Подтвердите/);
  assert.match((await f.owner.jobAction(f.job.id,{action:'close',confirmed:true})).message,/закрыта/);
  j=job(f);assert.equal(j.status,'completed');assert.match(j.report,/без исполнителя/);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_holds WHERE job_id=?').get(f.job.id).n,0);
 }finally{f.db.close();}
});
