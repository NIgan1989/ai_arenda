import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {testPayment}=await load('finance'),{shortWindowNote,shiftedStay}=await load('arrival-shift'),{RentalService}=await load('service');
const pay=f=>{f.db.raw.prepare("INSERT INTO platform_billing(id,test_payments) VALUES ('global',1) ON CONFLICT(id) DO UPDATE SET test_payments=1").run();return testPayment(f.guest,{bookingId:f.booking,kind:'all'},{},id=>new RentalService(f.db,id));};
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
