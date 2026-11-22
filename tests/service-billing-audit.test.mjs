import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
// GPT audit «Оплата услуг сервиса» (2026-11-22) and the free start chosen the same day: «14 дней бесплатно».
const {accrueCommission,sweepHallMonths,previousMonth}=await load('platform-billing');
const {writePlatformAdmin}=await load('platform-admin');
const {sweepDues,dueOf}=await load('service-dues');
const config=f=>({PLATFORM_ADMIN_IDS:f.other.userId});
const commission=(f,id)=>f.db.raw.prepare('SELECT * FROM platform_commissions WHERE booking_id=?').get(id);
const again=async(f,at)=>{const R=f.db.raw;R.prepare('DELETE FROM platform_commissions WHERE booking_id=?').run(f.booking);await accrueCommission(f.db,f.booking,R.prepare('SELECT id FROM audit_events LIMIT 1').get().id,at).run();return commission(f,f.booking);};

test('the first 14 days from the first listing are free for the owner, then the 4% is charged',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE platform_billing SET enabled=1,starts_at=0,free_days=14,free_bookings=0 WHERE id='global'").run();
  const first=R.prepare("SELECT MIN(created_at) n FROM properties WHERE owner_id='owner'").get().n;
  assert.equal((await again(f,first+13*86400)).mode,'free');
  assert.equal((await again(f,first+15*86400)).mode,'charged');
  // Billing switched on later: the days run from its start, so an early owner is not left without them.
  R.prepare("UPDATE platform_billing SET starts_at=? WHERE id='global'").run(first+30*86400);
  assert.equal((await again(f,first+35*86400)).mode,'free');
 }finally{f.db.close();}
});

test('a performer\'s first 14 days from the first charged cleaning are free',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE platform_billing SET plan_charge=1,free_days=14 WHERE id='global'").run();
  R.prepare("UPDATE cleaning_jobs SET fee=4000,status='submitted',assigned_to='cleaner' WHERE id=?").run(f.job.id);
  R.prepare("UPDATE cleaning_jobs SET status='completed' WHERE id=?").run(f.job.id);
  assert.equal(R.prepare("SELECT mode FROM service_fees WHERE kind='cleaning' AND ref_id=?").get(f.job.id).mode,'free');
  assert.equal(await dueOf(f.db,'cleaner'),0);
 }finally{f.db.close();}
});

test('the commission follows a price the guest and the owner agreed later',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const b=R.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking),before=commission(f,f.booking);
  assert.equal(before.amount,Math.floor((b.amount*400+5000)/10000));
  const end=iso(b.end+2*3600);
  const q=await f.guest.bookingChangeQuote(f.booking,'guest',{start:iso(b.start),end,billingMode:'hourly'});
  const c=await f.guest.proposeBookingChange(f.booking,'guest',{start:iso(b.start),end,billingMode:'hourly',expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true,reason:'Продлить',requestKey:'longer'});
  await f.owner.decideBookingChange(f.booking,c.id,'owner',{action:'accept'});
  const after=commission(f,f.booking);
  assert.equal(after.booking_amount,q.amount);assert.equal(after.amount,Math.floor((q.amount*400+5000)/10000));
  assert.ok(R.prepare("SELECT 1 FROM audit_events WHERE entity_id=? AND action LIKE '%commission_recalculated%'").get(f.booking));
 }finally{f.db.close();}
});

test('a hall month is billed by the capacity its bookings had, not by a later edit of the card',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,'{\"type\":\"banquet\"}','r',?) ON CONFLICT(property_id) DO UPDATE SET details=json_set(details,'$.type','banquet')").run(f.property,now());
  R.prepare('UPDATE properties SET capacity=90 WHERE id=?').run(f.property);
  R.prepare("UPDATE platform_billing SET enabled=1,starts_at=0 WHERE id='global'").run();
  const d=new Date((now()+18000)*1000),start=k=>Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+k,1)/1000-18000+86400;
  // A month before: a booking that already counted, so this month is not the first one.
  const held=start(0)+86400;R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(held,held+7200,held+7200,f.booking);
  await again(f,now());
  R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('old',?,'guest',?,?,?,1,1000,'completed',0,'owner_verified','old',0)").run(f.property,start(-1),start(-1)+7200,start(-1)+7200);
  R.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at,managed,capacity) SELECT 'old',owner_id,property_id,0,0,0,'charged',1,0,0,90 FROM platform_commissions WHERE booking_id=?").run(f.booking);
  R.prepare('UPDATE properties SET capacity=350 WHERE id=?').run(f.property);
  await sweepHallMonths(f.db,start(1));
  const row=R.prepare("SELECT amount FROM service_fees WHERE kind='hall_month' AND ref_id=?").get(f.property+':'+previousMonth(start(1)).name);
  assert.equal(row.amount,9900,'90 guests when booked: 9 900 ₸, not 29 900 ₸');
 }finally{f.db.close();}
});

test('the administrator records a payment for a performer, and a paused participant hears how to switch the autopilot back on',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("INSERT INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at) VALUES ('fee','cleaner','cleaner','cleaning','job-x',?,4900,'charged',?)").run(f.property,now());
  R.prepare("INSERT INTO service_billing(user_id,failed_at,paused_at,updated_at) VALUES ('cleaner',?,?,?)").run(now()-8*86400,now()-86400,now());
  assert.equal(await dueOf(f.db,'cleaner'),4900);
  const r=await writePlatformAdmin(f.other,'billing/balance',{ownerId:'cleaner',kind:'topup',amount:4900,note:'Kaspi, чек 123',bankRef:'123',confirmed:true,requestKey:'c1'},config(f));
  assert.match(r.message,/записано/);assert.equal(await dueOf(f.db,'cleaner'),0);
  await sweepDues(f.db,async()=>{},now());
  assert.equal(R.prepare("SELECT paused_at FROM service_billing WHERE user_id='cleaner'").get().paused_at,null);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='cleaner' AND dedupe LIKE 'service:unpaused:%'").get().body,/«Автопилот» включите снова/);
  await assert.rejects(writePlatformAdmin(f.other,'billing/balance',{ownerId:'guest',kind:'topup',amount:100,note:'x',confirmed:true,requestKey:'g1'},config(f)),e=>e.status===404);
 }finally{f.db.close();}
});
