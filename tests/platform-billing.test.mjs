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
