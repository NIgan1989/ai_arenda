import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');
const {commissionFor}=await load('platform-billing');
const config=f=>({PLATFORM_ADMIN_IDS:f.other.userId});
async function book(f,day,key){
 const id=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+day*86400),end:iso(now()+day*86400+7200),guests:1,billingMode:'hourly',requestKey:key,acceptTerms:true})).id;
 await f.owner.bookingAction(id,{action:'confirm',cleaningFee:0});return id;
}
const row=(f,id)=>f.db.raw.prepare('SELECT * FROM platform_commissions WHERE booking_id=?').get(id);
const ownerRow=state=>state.owners.find(o=>o.id==='owner');

test('commission math rounds to whole tenge and respects minimum, maximum and the booking amount',()=>{
 assert.equal(commissionFor(10000,{rate_bp:500,min_fee:0,max_fee:0}),500);
 assert.equal(commissionFor(4010,{rate_bp:500,min_fee:0,max_fee:0}),201);
 assert.equal(commissionFor(1000,{rate_bp:500,min_fee:300,max_fee:0}),300);
 assert.equal(commissionFor(100000,{rate_bp:1000,min_fee:0,max_fee:2000}),2000);
 assert.equal(commissionFor(200,{rate_bp:500,min_fee:300,max_fee:0}),200);
});

test('billing starts off: confirmed bookings only build the revenue forecast',async()=>{
 const f=await fixture();try{
  const shadow=row(f,f.booking);assert.equal(shadow.mode,'shadow');assert.equal(shadow.amount,Math.floor((shadow.booking_amount*500+5000)/10000));
  const state=await readPlatformAdmin(f.other,'billing',{},config(f));
  assert.equal(state.phase,'off');assert.equal(state.allTime.bookings,1);assert.equal(state.allTime.projected,shadow.amount);assert.equal(state.allTime.charged,0);
  assert.equal(ownerRow(state).balance,0);assert.equal(state.debtors,0);
  await assert.rejects(readPlatformAdmin(f.owner,'billing',{},config(f)),e=>e.status===403);
  await assert.rejects(writePlatformAdmin(f.owner,'billing/settings',{confirmed:true,enabled:true,ratePercent:5,startsAt:now(),freeBookings:0,expectedVersion:1},config(f)),e=>e.status===403);
 }finally{f.db.close();}
});

test('enabled billing gives free bookings first, then charges the owner balance; cancellations cost nothing',async()=>{
 const f=await fixture();try{
  await assert.rejects(writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:10,minFee:300,startsAt:now()-3600,freeBookings:1,expectedVersion:1},config(f)),/прошлом/);
  await assert.rejects(writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:45,startsAt:now(),freeBookings:1,expectedVersion:1},config(f)),/30%/);
  const saved=await writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:10,minFee:300,maxFee:0,startsAt:now(),freeBookings:1,expectedVersion:1},config(f));
  assert.equal(saved.version,2);assert.match(saved.message,/уведомление: 1/);
  const notice=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe='owner:billing:2'").get();assert.match(notice.body,/10%/);
  await assert.rejects(writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:false,ratePercent:10,expectedVersion:1},config(f)),e=>e.status===409);

  const free=await book(f,2,'b2'),charged=await book(f,3,'b3');
  assert.equal(row(f,free).mode,'free');assert.equal(row(f,charged).mode,'charged');
  const fee=row(f,charged).amount;assert.equal(fee,Math.max(300,Math.floor((row(f,charged).booking_amount*1000+5000)/10000)));
  let state=await readPlatformAdmin(f.other,'billing',{},config(f));
  assert.equal(state.phase,'active');assert.equal(ownerRow(state).balance,-fee);assert.equal(ownerRow(state).freeLeft,0);assert.equal(state.debtors,1);

  await assert.rejects(writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'topup',amount:-5,note:'Kaspi',requestKey:'t0'},config(f)),/больше нуля/);
  await assert.rejects(writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'guest',kind:'topup',amount:500,note:'Kaspi',requestKey:'t0'},config(f)),e=>e.status===404);
  await writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'topup',amount:1000,note:'Перевод Kaspi',requestKey:'t1'},config(f));
  await assert.rejects(writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'topup',amount:1000,note:'Перевод Kaspi',requestKey:'t1'},config(f)),e=>e.status===409);
  state=await readPlatformAdmin(f.other,'billing',{},config(f));assert.equal(ownerRow(state).balance,1000-fee);assert.equal(state.topups.length,1);

  // A booking cancelled after confirmation stops counting against the owner.
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(charged);
  state=await readPlatformAdmin(f.other,'billing',{},config(f));assert.equal(ownerRow(state).balance,1000);assert.equal(state.allTime.charged,0);

  // Switching billing off returns new confirmations to forecast-only mode.
  await writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:false,ratePercent:10,expectedVersion:2},config(f));
  assert.equal(row(f,await book(f,4,'b4')).mode,'shadow');
  state=await readPlatformAdmin(f.other,'billing',{},config(f));assert.equal(state.phase,'off');assert.equal(state.history[0].enabled,false);
 }finally{f.db.close();}
});

test('a future start date schedules billing without charging earlier confirmations',async()=>{
 const f=await fixture();try{
  await writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:5,startsAt:now()+30*86400,freeBookings:0,expectedVersion:1},config(f));
  assert.equal(row(f,await book(f,2,'s2')).mode,'shadow');
  assert.equal((await readPlatformAdmin(f.other,'billing',{},config(f))).phase,'scheduled');
 }finally{f.db.close();}
});

test('editing running billing keeps its start date; a past date is refused only for a new start',async()=>{
 const f=await fixture();try{
  const start=now()-5;f.db.raw.prepare("UPDATE platform_billing SET enabled=1,starts_at=?,version=2 WHERE id='global'").run(start-86400);
  const kept=await writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:7,startsAt:start-86400,freeBookings:0,expectedVersion:2},config(f));assert.equal(kept.version,3);
  const s=f.db.raw.prepare("SELECT starts_at,rate_bp FROM platform_billing").get();assert.equal(s.starts_at,start-86400);assert.equal(s.rate_bp,700);
  assert.equal((await readPlatformAdmin(f.other,'billing',{},config(f))).phase,'active');
  await assert.rejects(writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:7,startsAt:start-2*86400,freeBookings:0,expectedVersion:3},config(f)),/прошлом/);
 }finally{f.db.close();}
});

test('owner balances are searchable and paged on the server, and debtors are counted across all owners',async()=>{
 const f=await fixture();try{
  const insert=f.db.raw.prepare("INSERT INTO profiles(id,name,roles,city,contact,districts,experience,availability,created_at) SELECT ?,?,roles,city,contact,districts,experience,availability,created_at FROM profiles WHERE id='owner'");
  const prop=f.db.raw.prepare("INSERT INTO properties(id,owner_id,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) SELECT ?,?,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at FROM properties WHERE id=?");
  const debt=f.db.raw.prepare("INSERT INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) VALUES (?,?,'adjustment',-100,'долг','other',?,0)");
  for(let i=0;i<30;i++){insert.run('o'+i,'Хозяин '+i);prop.run('p'+i,'o'+i,f.property);debt.run('d'+i,'o'+i,'k'+i);}
  const state=await readPlatformAdmin(f.other,'billing',{},config(f));
  assert.equal(state.ownersTotal,31);assert.equal(state.owners.length,10);assert.equal(state.debtors,30);
  const last=await readPlatformAdmin(f.other,'billing/owners',{page:'3'},config(f));assert.equal(last.owners.length,1);
  const found=await readPlatformAdmin(f.other,'billing/owners',{search:'Хозяин 2'},config(f));assert.equal(found.total,11);assert.ok(found.owners.every(o=>o.name.startsWith('Хозяин 2')));
  await assert.rejects(readPlatformAdmin(f.owner,'billing/owners',{},config(f)),e=>e.status===403);
 }finally{f.db.close();}
});

test('hybrid tariff: a managed flat pays the base rate, the AI is paid per booking it confirmed (with a monthly cap), «Всё включено» pays neither',async()=>{
 const {matchingAction}=await load('smart-matching'),f=await fixture();try{
  const fee=id=>f.db.raw.prepare("SELECT * FROM service_fees WHERE kind='ai_booking' AND ref_id=?").get(id);
  const manual=await book(f,3,'manual-rate');assert.deepEqual([row(f,manual).rate_bp,row(f,manual).managed],[500,0]);assert.equal(fee(manual),undefined);
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  assert.equal(f.db.raw.prepare("SELECT tier FROM autopilot_plans WHERE user_id='owner' AND role='owner'").get().tier,'pay');
  const {RentalService}=await load('service');
  // The AI confirms on the owner's behalf (the same call the service makes when a request fits the rules).
  const ai=async(day,key)=>{const id=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+day*86400),end:iso(now()+day*86400+7200),guests:1,billingMode:'hourly',requestKey:key,acceptTerms:true})).id;
   if(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(id).status==='requested'){f.db.raw.prepare('DELETE FROM booking_risks WHERE booking_id=?').run(id);const p=f.db.raw.prepare('SELECT version,cleaning_fee FROM property_policies WHERE property_id=?').get(f.property);await new RentalService(f.db,'owner',{propertyId:f.property,policyVersion:p.version}).bookingAction(id,{action:'confirm',cleaningFee:p.cleaning_fee});}
   return id;};
  // Under autopilot the booking confirms itself: the base rate and 490 ₸ for the AI (a forecast while charging is off).
  const first=await ai(5,'ai-1');assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(first).status,'confirmed');
  assert.deepEqual([row(f,first).rate_bp,row(f,first).managed],[500,1]);assert.deepEqual([fee(first).amount,fee(first).mode,fee(first).role],[490,'shadow','owner']);
  // The monthly cap for one object (700 ₸ here): after 490 ₸ only 210 ₸ more is taken.
  f.db.raw.prepare("UPDATE platform_billing SET plan_charge=1,ai_month_cap=700").run();
  const second=await ai(6,'ai-2');assert.deepEqual([fee(second).amount,fee(second).mode],[490,'charged']);
  const third=await ai(7,'ai-3');assert.equal(fee(third).amount,210);
  // A cancelled booking frees its part of the cap.
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(second);
  const fourth=await ai(8,'ai-4');assert.equal(fee(fourth).amount,490);
  // «Всё включено»: no commission and no per-booking fee.
  f.db.raw.prepare("UPDATE autopilot_plans SET tier='all' WHERE user_id='owner'").run();
  const fifth=await ai(9,'ai-5');assert.equal(row(f,fifth).amount,0);assert.equal(fee(fifth),undefined);
 }finally{f.db.close();}
});
