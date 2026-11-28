import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {releaseWindow}=await load('overdue-cleaning');
const {sweepUnreadyArrivals,UNREADY_AHEAD}=await load('unready-arrival');
const {tServerIn}=await load('i18n');
const {noticeIn}=await load('notice-feed');
const job=f=>f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
const booking=f=>f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking);
const readiness=f=>f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness;
const assign=(f,start,end)=>f.db.raw.prepare("UPDATE cleaning_jobs SET status='assigned',assigned_to='cleaner',start=COALESCE(?,start),end=COALESCE(?,end) WHERE id=?").run(start??null,end??null,f.job.id);

// 28.11, Торайгырова 64: the cleaner gave up the cleaning after the stay before the guest even arrived; the cleaning
// moved to that morning, waited for a checkout that could not come and went overdue.
test('a cleaning after a stay given up by the cleaner keeps its time after the checkout',async()=>{
 const f=await fixture();try{
  const b=booking(f),planned=job(f);assert.ok(planned.start>=b.end);
  assign(f);
  await f.cleaner.jobAction(f.job.id,{action:'release'});
  const j=job(f);assert.equal(j.status,'open');assert.equal(j.start,planned.start);assert.equal(j.end,planned.end);
  // Already moved before the stay (as on 28.11): the next search opens at the checkout, not now.
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-5400,now()-60,f.job.id);
  const w=await releaseWindow(f.db,job(f),now());assert.ok(w.start>=b.end,'never before the checkout');
  // The guest left: the window opens from now as before.
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now(),f.booking);
  const t=now(),after=await releaseWindow(f.db,job(f),t);assert.ok(after.start<=t+1);
 }finally{f.db.close();}
});
test('the owner hears that cancelling the cleaning after a stay leaves nobody to clean, and again at the checkout',async()=>{
 const f=await fixture();try{
  const said=await f.owner.jobAction(f.job.id,{action:'cancel',reason:'Уборка просрочена'});
  assert.match(said.message,/убирать будет некому/);
  for(const l of ['kk','en'])assert.notEqual(tServerIn(l,said.message),said.message);
  // The stay: in and out. Nobody cleans after it, the owner is told at the checkout.
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(f.property);
  f.db.raw.prepare("UPDATE bookings SET start=?,payment_status='owner_verified' WHERE id=?").run(now()-60,f.booking);
  f.db.raw.prepare("UPDATE booking_terms SET deposit_status='owner_verified' WHERE booking_id=?").run(f.booking);
  await f.owner.bookingAction(f.booking,{action:'checkin'});
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  const n=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe=?").get('owner:no-cleaning-after:'+f.booking);
  assert.match(n.body,/уборки после него нет/);
  assert.notEqual(noticeIn('en',n.body),n.body);
 }finally{f.db.close();}
});
test('a cleaning ordered after a stay brings no checkout note',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(f.property);
  f.db.raw.prepare("UPDATE bookings SET start=?,payment_status='owner_verified' WHERE id=?").run(now()-60,f.booking);
  f.db.raw.prepare("UPDATE booking_terms SET deposit_status='owner_verified' WHERE booking_id=?").run(f.booking);
  await f.owner.bookingAction(f.booking,{action:'checkin'});await f.owner.bookingAction(f.booking,{action:'checkout'});
  assert.equal(f.db.raw.prepare("SELECT 1 FROM notifications WHERE dedupe=?").get('owner:no-cleaning-after:'+f.booking),undefined);
 }finally{f.db.close();}
});
test('the home not ready before an arrival: the guest is not let in, the owner decides three hours ahead',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE id=?").run(f.job.id);
  f.db.raw.prepare("UPDATE property_operations SET readiness='awaiting_cleaning' WHERE property_id=?").run(f.property);
  const start=booking(f).start;
  // Further than three hours: nothing yet.
  assert.equal((await sweepUnreadyArrivals(f.db,start-UNREADY_AHEAD-60)).asked,0);
  // A cleaner took a cleaning that ends in time: nothing to decide.
  f.db.raw.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,booking_id,start,end,fee,description,status,assigned_to,checklist,report,created_at) VALUES ('before',?,'owner',NULL,?,?,3000,'x','assigned','cleaner','[]','',?)").run(f.property,start-7200,start-1800,now());
  assert.equal((await sweepUnreadyArrivals(f.db,start-3600*2.5)).asked,0);
  // It went overdue: the owner gets the three ways out, the guest hears the home is being prepared, once.
  assert.equal((await sweepUnreadyArrivals(f.db,start-1700)).asked,1);
  assert.equal((await sweepUnreadyArrivals(f.db,start-1600)).asked,0);
  const owner=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:unready-arrival:%'").get().body;
  assert.match(owner,/уберите сами или своим персоналом/);assert.match(owner,/создайте уборку/);assert.match(owner,/сдвиньте заезд/);
  const guest=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:unready-arrival:%'").get().body;
  assert.match(guest,/ещё готовят/);
  for(const body of [owner,guest])for(const l of ['kk','en'])assert.notEqual(noticeIn(l,body),body,body);
  // The check-in stays closed while the home is not ready.
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE id='before'").run();
  f.db.raw.prepare("UPDATE bookings SET start=?,payment_status='owner_verified' WHERE id=?").run(now()-60,f.booking);
  f.db.raw.prepare("UPDATE booking_terms SET deposit_status='owner_verified' WHERE booking_id=?").run(f.booking);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'checkin'}),/не готово/);
  assert.equal(readiness(f),'awaiting_cleaning');
 }finally{f.db.close();}
});
