import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {rulesState,saveRule,ruleFor,minutesLabel,DECISION_RULES}=await load('decision-rules');
const {sweepStays}=await load('stay-watch');
const {sweepOverdueJobs}=await load('overdue-cleaning');

const booking=f=>f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking);
const notes=(f,user,like)=>f.db.raw.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND dedupe LIKE ?').get(user,like).n;
const at=(f,from,hours=3)=>f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=?,created_at=? WHERE id=?').run(now()+from,now()+from+hours*3600,now()+from+hours*3600+5400,now()-7200,f.booking);
const paid=f=>f.db.raw.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);
const set=(f,user,role,rule,body)=>saveRule(f.db,user,role,{rule,...body});

test('every question has a default that keeps what the service did before',()=>{
 assert.equal(minutesLabel(15),'15 мин');assert.equal(minutesLabel(60),'1 ч');assert.equal(minutesLabel(720),'12 ч');assert.equal(minutesLabel(90),'1 ч 30 мин');
 for(const r of DECISION_RULES){assert.ok(r.options.includes(r.minutes),r.key);assert.ok(!r.auto||r.off,r.key+' says what happens when it is off');}
 assert.deepEqual(DECISION_RULES.filter(r=>r.role==='owner').map(r=>r.key),['request','assign','accept','unpaid','no_show','overdue_job','checkout']);
});

test('the owner and the guest each see and change only their own questions',async()=>{
 const f=await fixture();try{
  const owner=await rulesState(f.db,'owner','owner'),guest=await rulesState(f.db,'guest','guest');
  assert.equal(owner.rules.length,7);assert.deepEqual(guest.rules.map(r=>r.key),['pay_remind']);
  assert.deepEqual((await rulesState(f.db,'cleaner','cleaner')).rules,[]);
  assert.deepEqual(owner.rules.find(r=>r.key==='assign').choices,[[15,'15 мин'],[30,'30 мин'],[60,'1 ч']]);
  const saved=await set(f,'owner','owner','assign',{on:false});
  assert.equal(saved.message,'Сохранено.');assert.equal(saved.rules.find(r=>r.key==='assign').on,false);
  await set(f,'owner','owner','assign',{minutes:60});
  assert.deepEqual(await ruleFor(f.db,'owner','assign'),{on:false,minutes:60});
  // The answer time of a request has no switch: the request always expires.
  await set(f,'owner','owner','request',{on:false,minutes:30});assert.deepEqual(await ruleFor(f.db,'owner','request'),{on:true,minutes:30});
  await assert.rejects(set(f,'owner','owner','assign',{minutes:45}),e=>e.status===400);
  await assert.rejects(set(f,'guest','guest','assign',{on:false}),e=>e.status===404);
  await assert.rejects(set(f,'owner','owner','nothing',{on:false}),e=>e.status===404);
  // One person's choice never changes another's.
  assert.deepEqual(await ruleFor(f.db,'other','assign'),{on:true,minutes:15});
 }finally{f.db.close();}
});

test('a request waits as long as the owner chose',async()=>{
 const f=await fixture();try{
  await set(f,'owner','owner','request',{minutes:60});
  const t=now(),id=(await f.guest.createBooking({propertyId:f.property,start:new Date((t+86400)*1000).toISOString(),end:new Date((t+86400+3*3600)*1000).toISOString(),guests:1,billingMode:'hourly',requestKey:'later',acceptTerms:true})).id;
  const expires=f.db.raw.prepare('SELECT expires_at FROM bookings WHERE id=?').get(id).expires_at;
  assert.ok(expires>=t+3600&&expires<=now()+3600,'one hour to answer');
 }finally{f.db.close();}
});

test('with «Гость не оплатил» off the AI only tells the owner; the wait is the owner\'s',async()=>{
 const f=await fixture();try{
  await set(f,'owner','owner','unpaid',{minutes:60});
  at(f,-1900);await sweepStays(f.db,{});assert.equal(booking(f).status,'confirmed');
  at(f,-3700);assert.equal((await sweepStays(f.db,{})).released,1);
 }finally{f.db.close();}
 const g=await fixture();try{
  await set(g,'owner','owner','unpaid',{on:false});
  at(g,-1900);await sweepStays(g.db,{});
  assert.equal(booking(g).status,'confirmed');assert.equal(notes(g,'owner','owner:stay-unpaid-ask:%'),1);
 }finally{g.db.close();}
});

test('the guest chooses when to be reminded about paying, or not at all',async()=>{
 const f=await fixture();try{
  await set(f,'guest','guest','pay_remind',{minutes:60});
  at(f,2*3600);assert.equal((await sweepStays(f.db,{})).reminded,0);
  at(f,50*60);assert.equal((await sweepStays(f.db,{})).reminded,1);
 }finally{f.db.close();}
 const g=await fixture();try{
  await set(g,'guest','guest','pay_remind',{on:false});
  at(g,50*60);assert.equal((await sweepStays(g.db,{})).reminded,0);assert.equal(notes(g,'guest','guest:stay-pay-remind:%'),0);
 }finally{g.db.close();}
});

test('with «Гость не приехал» off even the autopilot leaves the no-show to the owner',async()=>{
 const f=await fixture();try{
  paid(f);f.db.raw.prepare('UPDATE property_policies SET auto_confirm=1,auto_assign=1,mandate_until=0').run();
  await set(f,'owner','owner','no_show',{on:false});
  at(f,-1900);await sweepStays(f.db,{});
  assert.equal(booking(f).status,'confirmed');assert.equal(notes(f,'owner','owner:stay-no-show-ask:%'),1);
 }finally{f.db.close();}
});

test('with «Гость не выехал» off the service admin is not called',async()=>{
 const f=await fixture();try{
  paid(f);at(f,-4*3600,4);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkin=? WHERE booking_id=?').run(now()-4*3600,f.booking);
  await set(f,'owner','owner','checkout',{on:false});
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-1900,f.booking);
  assert.equal((await sweepStays(f.db,{PLATFORM_ADMIN_IDS:'admin'})).warned,1);
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-7300,f.booking);
  assert.equal((await sweepStays(f.db,{PLATFORM_ADMIN_IDS:'admin'})).escalated,0);
  assert.equal(notes(f,'admin','admin:stay-checkout:%'),0);
 }finally{f.db.close();}
});

test('a cleaning not started waits the owner\'s time, and with the switch off stays the owner\'s decision',async()=>{
 const late=(f,end)=>f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned',booking_id=NULL,start=?,end=? WHERE id=?").run(now()-7200,end,f.job.id);
 const f=await fixture();try{
  await set(f,'owner','owner','overdue_job',{minutes:15});
  late(f,now()-60);await sweepOverdueJobs(f.db,{});
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-1000,f.job.id);
  assert.equal((await sweepOverdueJobs(f.db,{})).released,1);
 }finally{f.db.close();}
 const g=await fixture();try{
  await set(g,'owner','owner','overdue_job',{on:false});
  late(g,now()-60);await sweepOverdueJobs(g.db,{});
  g.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-1900,g.job.id);
  const r=await sweepOverdueJobs(g.db,{});
  assert.equal(r.released,0);assert.equal(r.warned,1);
  assert.equal(g.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(g.job.id).status,'assigned');
 }finally{g.db.close();}
});
