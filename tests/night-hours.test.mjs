import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const night=await load('night-hours');
const {coordinateDispatch,saveOperationRules,saveWorkerDispatch}=await load('dispatch');
const {releaseWindow}=await load('overdue-cleaning');
const at=s=>Date.parse(s)/1000;
// Pavlodar time (UTC+5) without the real clock: the test sets the hour itself.
const clockAt=async(time,fn)=>{const real=Date.now;Date.now=()=>time*1000;night.nightRule.on=true;try{return await fn();}finally{Date.now=real;night.nightRule.on=false;}};

test('the quiet hours run from 23:00 to 08:00 in Pavlodar and the morning cleaning starts at 09:00',()=>{
 night.nightRule.on=true;try{
  assert.equal(night.isQuiet(at('2026-11-28T02:30:00+05:00')),true);
  assert.equal(night.isQuiet(at('2026-11-28T23:00:00+05:00')),true);
  assert.equal(night.isQuiet(at('2026-11-28T08:00:00+05:00')),false);
  assert.equal(night.isQuiet(at('2026-11-28T22:59:00+05:00')),false);
  assert.equal(night.morningAfter(at('2026-11-28T02:30:00+05:00')),at('2026-11-28T09:00:00+05:00'));
  assert.equal(night.morningAfter(at('2026-11-27T23:30:00+05:00')),at('2026-11-28T09:00:00+05:00'));
  // A cleaning from 22:00 for 1.5 h ends before midnight: it stays; from 22:45 it runs past midnight: a night one.
  assert.equal(night.nightCleaning(at('2026-11-28T22:00:00+05:00'),5400),false);
  assert.equal(night.nightCleaning(at('2026-11-28T22:45:00+05:00'),5400),true);
  assert.equal(night.nightCleaning(at('2026-11-28T12:00:00+05:00'),5400),false);
 }finally{night.nightRule.on=false;}
});

test('after a night checkout the cleaning goes to the morning, unless the next guest comes before it ends',async()=>{
 const f=await fixture();try{
  const out=at('2026-12-05T02:30:00+05:00');
  await clockAt(at('2026-12-04T20:00:00+05:00'),async()=>{
   const moved=await night.cleaningWindow(f.db,f.property,null,out,5400);
   assert.deepEqual(moved,{start:at('2026-12-05T09:00:00+05:00'),end:at('2026-12-05T10:30:00+05:00'),moved:true,urgent:false});
   f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('early',?,'guest',?,?,?,1,1000,'confirmed',0,'unpaid','early',0)").run(f.property,at('2026-12-05T07:00:00+05:00'),at('2026-12-05T09:00:00+05:00'),at('2026-12-05T10:00:00+05:00'));
   const urgent=await night.cleaningWindow(f.db,f.property,null,out,5400);
   assert.deepEqual(urgent,{start:out,end:out+5400,moved:false,urgent:true});
  });
 }finally{f.db.close();}
});

test('at night the autopilot offers a day cleaning to nobody and a night one only to those who work at night; the owner is told',async()=>{
 const f=await fixture();try{
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,offerMinutes:10,expectedVersion:0});await saveWorkerDispatch(f.cleaner,{receiveOffers:true});
  const morning=at('2026-12-05T09:00:00+05:00');
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=?,booking_id=NULL WHERE id=?').run(morning,morning+5400,f.job.id);
  assert.equal((await clockAt(at('2026-12-05T03:00:00+05:00'),()=>coordinateDispatch(f.owner))).offered,0);
  // Morning: the search starts.
  assert.equal((await clockAt(at('2026-12-05T08:05:00+05:00'),()=>coordinateDispatch(f.owner))).offered,1);
  f.db.raw.prepare('DELETE FROM cleaning_offers').run();
  // A cleaning at 03:30 because the next guest comes early: at night nobody without night hours is asked, the owner is told.
  const late=at('2026-12-05T03:30:00+05:00');
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(late,late+5400,f.job.id);
  assert.equal((await clockAt(at('2026-12-05T03:00:00+05:00'),()=>coordinateDispatch(f.owner))).offered,0);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:night-cleaning:%'").get());
 }finally{f.db.close();}
});

test('an unclaimed cleaning found at night is searched again in the morning',async()=>{
 const f=await fixture();try{
  const job={...f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id),booking_id:null,start:at('2026-12-05T01:00:00+05:00'),end:at('2026-12-05T02:30:00+05:00')};
  f.db.raw.prepare("UPDATE bookings SET status='cancelled'").run();
  const w=await clockAt(at('2026-12-05T03:00:00+05:00'),()=>releaseWindow(f.db,job,at('2026-12-05T03:00:00+05:00')));
  assert.deepEqual(w,{start:at('2026-12-05T09:00:00+05:00'),end:at('2026-12-05T10:30:00+05:00')});
 }finally{f.db.close();}
});

test('the place stays closed between a night checkout and the morning cleaning',async()=>{
 const f=await fixture();try{
  const day=Math.floor(Date.now()/1000/86400+3)*86400-18000,out=day+2*3600+1800,iso=t=>new Date(t*1000).toISOString();
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(out-7200,out,out+5400,f.booking);
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(day+9*3600,day+9*3600+5400,f.job.id);
  await assert.rejects(f.guest.bookingQuote({propertyId:f.property,start:iso(day+5*3600),end:iso(day+7*3600),guests:1,billingMode:'hourly'}),/занят/);
  assert.ok(await f.guest.bookingQuote({propertyId:f.property,start:iso(day+12*3600),end:iso(day+14*3600),guests:1,billingMode:'hourly'}));
 }finally{f.db.close();}
});

test('the map strip sees a morning cleaning holding the place from the night checkout',async()=>{
 const {busyAround}=await load('arrival-ready');
 const f=await fixture();try{
  const day=Math.floor(Date.now()/1000/86400+3)*86400-18000,out=day+2*3600+1800;
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(out-7200,out,out+5400,f.booking);
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(day+9*3600,day+9*3600+5400,f.job.id);
  const job=(await busyAround(f.db,day+5*3600,day+7*3600,Math.floor(Date.now()/1000))).find(x=>x.kind==='job');
  assert.equal(job.start,out);
 }finally{f.db.close();}
});
