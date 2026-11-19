import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {matchingAction}=await load('smart-matching'),{sweepArrivals,shiftFor,cleaningEnds}=await load('arrival-autopilot'),{shortWindowNote,shiftedStay}=await load('arrival-shift'),{RentalService}=await load('service');
// Direct settlement: the guest says «Я оплатил», the owner confirms the money («received»).
const pay=async f=>{await f.guest.bookingAction(f.booking,{action:'report_paid'});return f.owner.bookingAction(f.booking,{action:'received'});};
const notes=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').all(user,like).map(r=>r.body);
// The guest of the fixture arrives in `inMinutes`; a previous guest left 10 minutes ago and the cleaning time after them
// still runs for 80 minutes.
async function between(inMinutes){
 const f=await fixture(),R=f.db.raw,t=now();
 R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(t+inMinutes*60,t+inMinutes*60+7200,t+inMinutes*60+7200+5400,f.booking);
 R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE booking_id=?').run(t+inMinutes*60+7200,t+inMinutes*60+7200+5400,f.booking);
 R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('prev',?,'other',?,?,?,1,4000,'completed',0,'owner_verified','prev',?)").run(f.property,t-3*3600,t-600,t+80*60,t-4*3600);
 R.prepare("UPDATE property_operations SET readiness='awaiting_cleaning',active_booking_id=NULL WHERE property_id=?").run(f.property);
 return f;
}

test('cleaned early: the rest of the cleaning time is free and the owner may let the next guest in early',async()=>{
 const f=await between(150),R=f.db.raw;try{
  await pay(f);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'report_checkin'}),/за 15 минут/);
  await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});
  assert.ok(R.prepare("SELECT occupied_until FROM bookings WHERE id='prev'").get().occupied_until<=now()+1,'the cleaning time left is released');
  assert.match(notes(f,'owner','owner:early-offer:%').join(' '),/Можно пустить его раньше/);
  const r=await f.owner.bookingAction(f.booking,{action:'early_checkin'});assert.match(r.message,/может заселиться уже сейчас/);
  assert.match(notes(f,'guest','guest:early-checkin:%').join(' '),/можно заселиться раньше/);
  await f.guest.bookingAction(f.booking,{action:'report_checkin'});
  const done=await f.owner.bookingAction(f.booking,{action:'checkin'});assert.match(done.message,/подтверждено/);
 }finally{f.db.close();}
});

test('early check-in needs a ready, paid home and the owner',async()=>{
 const f=await between(150);try{
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'early_checkin'}),/убрано и готово/);
  await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'early_checkin'}),/не оплатил/);
  await pay(f);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'early_checkin'}),/владелец/);
 }finally{f.db.close();}
});

test('running late: the guest is asked to come later, and the cleaning before them gets the time',async()=>{
 const f=await between(40),R=f.db.raw,t=now();try{
  // The cleaning after the previous guest was cut at this arrival.
  R.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,description,start,end,fee,status,created_at) SELECT 'late',?,owner_id,'prev','Уборка',?,?,3000,'open',? FROM properties WHERE id=?").run(f.property,t-600,t+40*60,t,f.property);
  const before=R.prepare('SELECT start,end,amount FROM bookings WHERE id=?').get(f.booking);
  const r=await f.owner.bookingAction(f.booking,{action:'shift_arrival',minutes:60});assert.match(r.message,/Предложение отправлено/);
  const c=R.prepare("SELECT id,reason FROM booking_changes WHERE booking_id=? AND status='pending'").get(f.booking);assert.match(c.reason,/на 1 ч позже/);
  await f.guest.decideBookingChange(f.booking,c.id,'guest',{action:'accept'});
  const after=R.prepare('SELECT start,end,amount FROM bookings WHERE id=?').get(f.booking);
  assert.deepEqual([after.start-before.start,after.end-before.end,after.amount],[3600,3600,before.amount],'an hourly stay moves whole at the same price');
  const late=R.prepare("SELECT start,end FROM cleaning_jobs WHERE id='late'").get();
  assert.equal(late.end,Math.min(late.start+90*60,after.start),'the cleaning gets the time it needs, never past the arrival');
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'shift_arrival',minutes:45}),/на сколько/);
 }finally{f.db.close();}
});

test('the owner reads how much cleaning time is left',()=>{
 assert.equal(shortWindowNote({start:0,end:3600},5400).trim().startsWith('На уборку осталось 60 мин из 90'),true);
 assert.equal(shortWindowNote({start:0,end:5400},5400),'');
 assert.deepEqual(shiftedStay({start:100,end:200},'daily',60),{start:160,end:200});
 assert.deepEqual(shiftedStay({start:100,end:200},'hourly',60),{start:160,end:260});
});

test('the time a guest was let in early stays theirs, and is only offered when free',async()=>{
 const f=await between(150),R=f.db.raw,t=now();try{
  await pay(f);await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});
  R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('gap',?,'other',?,?,?,1,4000,'requested',?,'unpaid','gap',?)").run(f.property,t+20*60,t+80*60,t+100*60,t+600,t);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'early_checkin'}),/ещё занято/);
  R.prepare("UPDATE bookings SET status='expired' WHERE id='gap'").run();
  await f.owner.bookingAction(f.booking,{action:'early_checkin'});
  assert.throws(()=>R.prepare("UPDATE bookings SET status='requested',expires_at=? WHERE id='gap'").run(t+600),/booking_overlap/);
  assert.throws(()=>R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('gap2',?,'other',?,?,?,1,4000,'requested',?,'unpaid','gap2',?)").run(f.property,t+30*60,t+60*60,t+90*60,t+600,t),/booking_overlap/);
 }finally{f.db.close();}
});

test('a later arrival asked by the owner keeps the agreed price of a daily stay',async()=>{
 const f=await between(40),R=f.db.raw;try{
  R.prepare("UPDATE booking_terms SET billing_mode='daily' WHERE booking_id=?").run(f.booking);
  const b0=R.prepare('SELECT start FROM bookings WHERE id=?').get(f.booking);
  R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE booking_id=?').run(b0.start+86400,b0.start+86400+5400,f.booking);
  R.prepare('UPDATE bookings SET end=?,occupied_until=? WHERE id=?').run(b0.start+86400,b0.start+86400+5400,f.booking);
  const before=R.prepare('SELECT start,end,amount FROM bookings WHERE id=?').get(f.booking);
  await f.owner.bookingAction(f.booking,{action:'shift_arrival',minutes:120});
  const c=R.prepare("SELECT id,amount FROM booking_changes WHERE booking_id=? AND status='pending'").get(f.booking);assert.equal(c.amount,before.amount);
  await f.guest.decideBookingChange(f.booking,c.id,'guest',{action:'accept'});
  const after=R.prepare('SELECT start,end,amount FROM bookings WHERE id=?').get(f.booking);
  assert.deepEqual([after.start-before.start,after.end,after.amount],[7200,before.end,before.amount]);
 }finally{f.db.close();}
});

test('the cleaning before a later arrival is not stretched into the same cleaner\'s next job',async()=>{
 const f=await between(40),R=f.db.raw,t=now();try{
  R.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,description,start,end,fee,status,assigned_to,created_at) SELECT 'late',?,owner_id,'prev','Уборка',?,?,3000,'assigned','cleaner',? FROM properties WHERE id=?").run(f.property,t-600,t+40*60,t,f.property);
  R.exec('CREATE TEMP TABLE p2 AS SELECT * FROM properties WHERE id='+JSON.stringify(f.property).replace(/"/g,"'"));R.exec("UPDATE p2 SET id='p2';INSERT INTO properties SELECT * FROM p2");
  R.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,description,start,end,fee,status,assigned_to,created_at) SELECT 'next','p2',owner_id,'Уборка',?,?,3000,'assigned','cleaner',? FROM properties WHERE id=?").run(t+50*60,t+140*60,t,f.property);
  await f.owner.bookingAction(f.booking,{action:'shift_arrival',minutes:60});
  const c=R.prepare("SELECT id FROM booking_changes WHERE booking_id=? AND status='pending'").get(f.booking);
  await f.guest.decideBookingChange(f.booking,c.id,'guest',{action:'accept'});
  assert.equal(R.prepare("SELECT end FROM cleaning_jobs WHERE id='late'").get().end,t+40*60,'the cleaner keeps the next job, the arrival still moves');
  assert.equal(R.prepare("SELECT status FROM booking_changes WHERE id=?").get(c.id).status,'accepted');
 }finally{f.db.close();}
});

const autopilot=f=>matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});

test('autopilot: a ready home lets the next guest in early by itself, only when they are close',async()=>{
 const near=await between(120),far=await between(240);try{
  for(const f of [near,far]){await autopilot(f);await pay(f);await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});}
  assert.equal(notes(near,'owner','owner:early-offer:%').length,0,'no offer: the AI does it');
  assert.deepEqual(await sweepArrivals(near.db),{early:1,shifted:0});
  assert.ok(near.db.raw.prepare('SELECT early_checkin_at FROM booking_terms WHERE booking_id=?').get(near.booking).early_checkin_at);
  assert.match(notes(near,'owner','owner:auto-early:%').join(' '),/может заселиться раньше/);
  assert.deepEqual(await sweepArrivals(near.db),{early:0,shifted:0},'said and done once');
  assert.deepEqual(await sweepArrivals(far.db),{early:0,shifted:0},'four hours ahead the owner decides');
  assert.equal(notes(far,'owner','owner:early-offer:%').length,1);
 }finally{near.db.close();far.db.close();}
});

test('autopilot: a cleaning that will not end in time asks the guest to come later, once',async()=>{
 const f=await between(40),R=f.db.raw,t=now();try{
  await autopilot(f);
  R.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,description,start,end,fee,status,assigned_to,created_at) SELECT 'late',?,owner_id,'prev','Уборка',?,?,3000,'assigned','cleaner',? FROM properties WHERE id=?").run(f.property,t-600,t+40*60,t,f.property);
  assert.deepEqual(await sweepArrivals(f.db),{early:0,shifted:1});
  const c=R.prepare("SELECT reason,start FROM booking_changes WHERE booking_id=? AND status='pending'").get(f.booking);
  assert.match(c.reason,/на 1 ч позже/);
  assert.match(notes(f,'owner','owner:auto-shift:%').join(' '),/попросил гостя заехать/);
  assert.deepEqual(await sweepArrivals(f.db),{early:0,shifted:0});
 }finally{f.db.close();}
});

test('autopilot: without the autopilot nothing is done for the owner',async()=>{
 const f=await between(40),R=f.db.raw,t=now();try{
  R.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,description,start,end,fee,status,assigned_to,created_at) SELECT 'late',?,owner_id,'prev','Уборка',?,?,3000,'assigned','cleaner',? FROM properties WHERE id=?").run(f.property,t-600,t+40*60,t,f.property);
  assert.deepEqual(await sweepArrivals(f.db),{early:0,shifted:0});
 }finally{f.db.close();}
});

test('how late and by how much',()=>{
 assert.deepEqual([shiftFor(60),shiftFor(1800),shiftFor(1801),shiftFor(5000),shiftFor(99999)],[30,30,60,120,120]);
 assert.equal(cleaningEnds({status:'assigned',start:0,end:3000},90,1000),1000+5400);
 assert.equal(cleaningEnds({status:'in_progress',start:0,end:3000},90,1000),3000);
});
