import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {sweepStays,payDue,similarFree,similarText}=await load('stay-watch');
const {lateUntil,lateOpen,lateNote,arrivalDue}=await load('late-arrival');
const {guestSteps}=await load('guest-trips');
const {aiNoteOf}=await load('ai-move-marks');

const booking=f=>f.db.raw.prepare('SELECT b.*,t.arrival_eta,t.late_count,t.paid_amount FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=?').get(f.booking);
const watch=f=>f.db.raw.prepare('SELECT * FROM stay_watch WHERE booking_id=?').get(f.booking)||{};
const notes=(f,user,like)=>f.db.raw.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND dedupe LIKE ?').get(user,like).n;
// Moves the stay so that it starts `from` seconds from now and lasts `hours`.
const at=(f,from,hours=3,created=-7200)=>f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=?,created_at=? WHERE id=?').run(now()+from,now()+from+hours*3600,now()+from+hours*3600+5400,now()+created,f.booking);
const paid=f=>f.db.raw.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);
const autopilot=f=>f.db.raw.prepare('UPDATE property_policies SET auto_confirm=1,auto_assign=1,mandate_until=0').run();

test('the time to pay and to arrive',()=>{
 const t=now();
 assert.equal(payDue({start:t+7200,created_at:t}),t+7200);
 // A stay booked for right now still leaves half an hour to pay.
 assert.equal(payDue({start:t+60,created_at:t}),t+1800);
 assert.equal(arrivalDue({start:t,arrival_eta:t+3600}),t+3600);
 assert.equal(lateUntil({start:t+600,end:t+10800},t),t+4200);
 assert.equal(lateUntil({start:t+600,end:t+10800,late_count:3},t),null);
 assert.equal(lateUntil({start:t+600,end:t+3000},t),null);
 assert.equal(lateOpen({start:t+4*3600,end:t+8*3600},t),false);
 assert.equal(lateOpen({start:t+2*3600,end:t+8*3600},t),true);
 assert.match(lateNote({start:t,arrival_eta:t+3600},t),/Владелец предупреждён: вы приедете к \d\d:\d\d/);
 assert.equal(lateNote({start:t},t),'');
});

test('an unpaid stay: reminded, warned, then released and the home is free',async()=>{
 const f=await fixture();try{
  at(f,2*3600);
  assert.equal((await sweepStays(f.db,{})).reminded,1);
  assert.equal(watch(f).pay_step,1);assert.equal((await sweepStays(f.db,{})).reminded,0);
  assert.equal(notes(f,'guest','guest:stay-pay-remind:%'),1);
  at(f,-60);
  assert.equal((await sweepStays(f.db,{})).warned,1);
  assert.equal(notes(f,'owner','owner:stay-pay-warn:%'),1);assert.equal(booking(f).status,'confirmed');
  at(f,-1900);
  assert.equal((await sweepStays(f.db,{})).released,1);
  assert.equal(booking(f).status,'cancelled');
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE booking_id=?').get(f.booking).status,'cancelled');
  assert.equal(notes(f,'guest','guest:stay-unpaid-released:%'),1);assert.equal(notes(f,'owner','owner:stay-unpaid-released:%'),1);
  assert.equal((await sweepStays(f.db,{})).released,0);
 }finally{f.db.close();}
});

test('a stay paid in part is never released by the AI, the owner decides',async()=>{
 const f=await fixture();try{
  at(f,-1900);f.db.raw.prepare('UPDATE booking_terms SET paid_amount=1000 WHERE booking_id=?').run(f.booking);
  await sweepStays(f.db,{});
  assert.equal(booking(f).status,'confirmed');assert.equal(notes(f,'owner','owner:stay-pay-part:%'),1);
 }finally{f.db.close();}
});

test('a paid guest who does not come is asked, then the owner decides without the autopilot',async()=>{
 const f=await fixture();try{
  paid(f);at(f,-1000);
  assert.equal((await sweepStays(f.db,{})).reminded,1);
  assert.equal(notes(f,'guest','guest:stay-arrival-ask:%'),1);
  at(f,-1900);
  assert.equal((await sweepStays(f.db,{})).warned,1);
  assert.equal(booking(f).status,'confirmed');assert.equal(notes(f,'owner','owner:stay-no-show-ask:%'),1);
 }finally{f.db.close();}
});

test('with the autopilot a no-show is released; «Задерживаюсь на час» moves the arrival and starts over',async()=>{
 const f=await fixture();try{
  paid(f);autopilot(f);at(f,-1000);
  await sweepStays(f.db,{});assert.equal(watch(f).arrival_step,1);
  // The guest answers: one hour later. The questions start over from the new time.
  assert.match((await f.guest.bookingAction(f.booking,{action:'report_late'})).message,/Владелец предупреждён/);
  assert.equal(booking(f).late_count,1);assert.ok(booking(f).arrival_eta>now()+3000);assert.equal(watch(f).arrival_step,0);
  assert.equal(notes(f,'owner','owner:guest-late:%'),1);
  await sweepStays(f.db,{});assert.equal(booking(f).status,'confirmed');
  // Still nobody an hour and a half after the new time: the stay is released.
  f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(now()-3000,f.booking);
  f.db.raw.prepare('UPDATE booking_terms SET arrival_eta=? WHERE booking_id=?').run(now()-1900,f.booking);
  assert.equal((await sweepStays(f.db,{})).released,1);
  assert.equal(booking(f).status,'cancelled');assert.equal(notes(f,'owner','owner:stay-no-show:%'),1);
 }finally{f.db.close();}
});

test('«Задерживаюсь на час» is the guest’s, opens 3 hours before and stops after three times',async()=>{
 const f=await fixture();try{
  at(f,4*3600,8);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'report_late'}),/за 3 часа/);
  at(f,1800,8);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'report_late'}),e=>e.status===403);
  for(let i=0;i<3;i++)await f.guest.bookingAction(f.booking,{action:'report_late'});
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'report_late'}),/Больше переносить/);
 }finally{f.db.close();}
});

test('a guest who stays past the end: reminded, then the owner and the cleaner, then the service admin',async()=>{
 const f=await fixture();try{
  paid(f);at(f,-4*3600,4);
  f.db.raw.prepare("UPDATE booking_terms SET actual_checkin=? WHERE booking_id=?").run(now()-4*3600,f.booking);
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned' WHERE booking_id=?").run(f.booking);
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-60,f.booking);
  assert.equal((await sweepStays(f.db,{})).reminded,1);assert.equal(notes(f,'guest','guest:stay-checkout-remind:%'),1);
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-1900,f.booking);
  assert.equal((await sweepStays(f.db,{})).warned,1);
  assert.equal(notes(f,'owner','owner:stay-checkout-late:%'),1);assert.equal(notes(f,'cleaner','cleaner:stay-checkout-late:%'),1);
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-7300,f.booking);
  assert.equal((await sweepStays(f.db,{PLATFORM_ADMIN_IDS:'admin'})).escalated,1);
  assert.equal(notes(f,'admin','admin:stay-checkout:%'),1);
  assert.equal(booking(f).status,'confirmed');
 }finally{f.db.close();}
});

test('a request left without an answer shows the guest similar homes free on the same dates',async()=>{
 const f=await fixture();try{
  const other=(await f.other.createProperty({title:'Second home',city:'Павлодар',district:'Центр',address:'X',description:'Test',price:11000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  const far=(await f.other.createProperty({title:'Expensive home',city:'Павлодар',district:'Центр',address:'Y',description:'Test',price:50000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  const list=await similarFree(f.db,f.booking);
  assert.deepEqual(list.map(p=>p.id),[other]);assert.ok(!list.some(p=>p.id===far));
  assert.match(similarText(list),/«Second home»/);assert.equal(similarText([]),'');
 }finally{f.db.close();}
});

test('the guest card offers «Задерживаюсь на час» and every step reaches the AI journal',()=>{
 const t=now(),b={status:'confirmed',start:t+1800,end:t+7200,amount:1,terms:{paid_amount:1}};
 assert.ok(guestSteps(b,t).some(s=>s.id==='late'));
 assert.ok(!guestSteps({...b,terms:{...b.terms,actual_checkin:t}},t).some(s=>s.id==='late'));
 for(const key of ['guest:stay-pay-remind:x','owner:stay-unpaid-released:x','guest:stay-arrival-ask:x:1','owner:stay-no-show:x','owner:stay-checkout-late:x','cleaner:stay-checkout-late:x'])assert.ok(aiNoteOf(key,t),key);
});

test('a guest who says they are inside is never released for an unrecorded payment',async()=>{
 const f=await fixture();try{
  at(f,-1900);f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now()-1800,f.booking);
  await sweepStays(f.db,{});
  assert.equal(booking(f).status,'confirmed');assert.equal(notes(f,'owner','owner:stay-pay-part:%'),1);
 }finally{f.db.close();}
});

test('a stay extended after its checkout was escalated is watched again from the new end',async()=>{
 const f=await fixture();try{
  paid(f);at(f,-4*3600,4);
  f.db.raw.prepare("UPDATE booking_terms SET actual_checkin=? WHERE booking_id=?").run(now()-4*3600,f.booking);
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-7300,f.booking);
  await sweepStays(f.db,{});await sweepStays(f.db,{});assert.equal(watch(f).checkout_step,3);
  // The stay is extended, and the new end passes too: the guest is reminded again.
  f.db.raw.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-60,f.booking);
  assert.equal((await sweepStays(f.db,{})).reminded,1);assert.equal(notes(f,'guest','guest:stay-checkout-remind:%'),1);
 }finally{f.db.close();}
});

test('a home busy in its external calendar is not offered as free',async()=>{
 const f=await fixture();try{
  const other=(await f.other.createProperty({title:'Second home',city:'Павлодар',district:'Центр',address:'X',description:'Test',price:11000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  const b=booking(f);
  f.db.raw.prepare("INSERT INTO calendar_sources(id,property_id,owner_id,label,url,enabled,last_success,created_at) VALUES ('src',?,'other','Booking','',1,?,?)").run(other,now(),now());
  f.db.raw.prepare("INSERT INTO external_blocks(id,source_id,property_id,event_uid,start,end) VALUES ('blk','src',?,'e1',?,?)").run(other,b.start-60,b.end+60);
  assert.deepEqual(await similarFree(f.db,f.booking),[]);
 }finally{f.db.close();}
});
