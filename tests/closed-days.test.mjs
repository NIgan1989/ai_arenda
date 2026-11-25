import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';
const {closeDay,openDay,ownerClosedDays}=await load('closed-days');
const {cleanerOffers,decideOffer}=await load('dispatch');

// «Закрыть день» in the owner's calendar (lib/closed-days.ts) and the cleaner's own offers on the map (lib/dispatch.ts).
const DAY=86400,ZONE=18000;
const dayOf=t=>Math.floor((t+ZONE)/DAY)*DAY-ZONE;

test('a closed day is not booked by guests, opens again, and is not shown as a calendar of another site',async()=>{
 const f=await fixture();try{
  const day=dayOf(now())+5*DAY,stay={propertyId:f.property,start:iso(day+14*3600),end:iso(day+DAY+12*3600),guests:1,billingMode:'daily',acceptTerms:true};
  const shut=await closeDay(f.owner,{propertyId:f.property,day});
  assert.match(shut.message,/День закрыт/);assert.deepEqual(shut.closedDays,[{property_id:f.property,day}]);
  // Closing it again changes nothing; the owner's state carries the day for the calendar.
  await closeDay(f.owner,{propertyId:f.property,day});
  assert.deepEqual((await f.owner.roleState('owner',{catalog:false})).closedDays,[{property_id:f.property,day}]);
  await assert.rejects(f.guest.createBooking({...stay,requestKey:'shut'}),/занят/);
  const {flatCalendars}=await load('external-calendar');assert.deepEqual((await flatCalendars(f.owner,{propertyId:f.property})).sources,[]);
  const open=await openDay(f.owner,{propertyId:f.property,day});
  assert.match(open.message,/открыт/);assert.deepEqual(open.closedDays,[]);
  assert.ok((await f.guest.createBooking({...stay,requestKey:'open'})).id);
 }finally{f.db.close();}
});

test('a day with a stay is not closed; a guest leaving that morning does not stand in the way',async()=>{
 const f=await fixture();try{
  const day=dayOf(now())+7*DAY;
  const id=(await f.guest.createBooking({propertyId:f.property,start:iso(day-DAY+14*3600),end:iso(day+12*3600),guests:1,billingMode:'daily',acceptTerms:true,requestKey:'night'})).id;
  // The request alone already holds the night it asks for.
  await assert.rejects(closeDay(f.owner,{propertyId:f.property,day:day-DAY}),/бронь или заявка/);
  const shut=await closeDay(f.owner,{propertyId:f.property,day});assert.equal(shut.closedDays.length,1);
  const until=f.db.raw.prepare('SELECT occupied_until u FROM bookings WHERE id=?').get(id).u,block=f.db.raw.prepare("SELECT start,end FROM external_blocks WHERE event_uid=?").get('closed:'+day);
  assert.equal(block.start,Math.max(day,until));assert.equal(block.end,day+DAY);
  // A stay through the whole day leaves nothing to close.
  const later=day+3*DAY;await f.guest.createBooking({propertyId:f.property,start:iso(later-DAY+14*3600),end:iso(later+DAY+12*3600),guests:1,billingMode:'daily',acceptTerms:true,requestKey:'long'});
  await assert.rejects(closeDay(f.owner,{propertyId:f.property,day:later}),/живёт гость/);
 }finally{f.db.close();}
});

test('only the owner closes, only today or later, only a whole day',async()=>{
 const f=await fixture();try{
  const day=dayOf(now())+2*DAY;
  await assert.rejects(closeDay(f.other,{propertyId:f.property,day}),/недоступно/);
  await assert.rejects(closeDay(f.owner,{propertyId:f.property,day:day-5*DAY}),/сегодняшний или будущий/);
  await assert.rejects(closeDay(f.owner,{propertyId:f.property,day:day+3600}),/Выберите день/);
  await assert.rejects(closeDay(f.guest,{propertyId:f.property,day}),/./);
  assert.deepEqual(await ownerClosedDays(f.db,'owner'),[]);
 }finally{f.db.close();}
});

test('the cleaner sees the offers made to them while there is time to answer, and how many places pin them',async()=>{
 const f=await fixture();try{
  const t=now(),job=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
  // Copies of the open cleaning on later days, so one person can hold several offers.
  const columns=f.db.raw.prepare('PRAGMA table_info(cleaning_jobs)').all().map(c=>c.name),copy=(id,days)=>f.db.raw.prepare(`INSERT INTO cleaning_jobs(${columns.join(',')}) SELECT ${columns.map(c=>c==='id'?'?':c==='booking_id'?'NULL':c==='start'||c==='end'?c+'+'+days*DAY:c).join(',')} FROM cleaning_jobs WHERE id=?`).run(id,job.id);
  copy('job2',10);copy('job3',20);
  const offer=(id,jobId,worker,status,expires)=>f.db.raw.prepare("INSERT INTO cleaning_offers VALUES (?,?,?,?,?,?,3000,0,?,?,?,NULL)").run(id,jobId,worker,job.version,job.start,job.end,status,t-60,expires);
  offer('live',job.id,'cleaner','offered',t+540);offer('late','job2','cleaner','offered',t-1);offer('gone','job3','cleaner','declined',t+540);offer('theirs',job.id,'other','offered',t+540);
  const mine=await cleanerOffers(f.db,'cleaner',t);
  assert.deepEqual(mine.cleaningOffers.map(o=>o.id),['live']);assert.equal(mine.cleaningOffers[0].expires_at,t+540);assert.equal(mine.regularPlaces,0);
  const state=await f.cleaner.roleState('cleaner',{catalog:false});assert.deepEqual(state.cleaningOffers.map(o=>o.id),['live']);assert.equal(state.regularPlaces,0);
  assert.equal((await f.owner.roleState('owner',{catalog:false})).cleaningOffers,undefined);
  // «Отказаться» passes the offer on: it is gone from the map.
  await decideOffer(f.cleaner,{id:'live',action:'decline'});
  assert.deepEqual((await cleanerOffers(f.db,'cleaner',t)).cleaningOffers,[]);
  f.db.raw.prepare('INSERT INTO regular_cleaners VALUES (?,?,?,?)').run(f.property,'owner','cleaner',t);
  assert.equal((await cleanerOffers(f.db,'cleaner',t)).regularPlaces,1);
 }finally{f.db.close();}
});

test('while adding a flat the owner sees what similar flats in the city ask, only when there are three to compare with',async()=>{
 const f=await fixture();try{
  const {similarRange}=await load('price-advice');
  const p=f.db.raw.prepare('SELECT * FROM properties WHERE id=?').get(f.property);
  const columns=f.db.raw.prepare('PRAGMA table_info(properties)').all().map(c=>c.name);
  // Flats of another owner in the same city, as published listings.
  const copy=(id,price)=>f.db.raw.prepare(`INSERT INTO properties(${columns.join(',')}) SELECT ${columns.map(c=>c==='id'||c==='price'?'?':c==='owner_id'?"'other'":c==='published'?'1':c==='archived_at'||c==='demo_owner'?'NULL':c).join(',')} FROM properties WHERE id=?`).run(...columns.filter(c=>c==='id'||c==='price').map(c=>c==='id'?id:price),f.property);
  copy('a',10000);copy('b',12000);
  assert.deepEqual(await similarRange(f.owner,{city:p.city,rooms:p.rooms}),{similar:2,low:null,high:null});
  copy('c',13000);copy('d',20000);copy('e',9000);
  assert.deepEqual(await similarRange(f.owner,{city:p.city,rooms:p.rooms}),{similar:5,low:10000,high:13000});
  // The owner's own flats and another city are not compared with.
  assert.equal((await similarRange(f.owner,{city:'Другой город',rooms:p.rooms})).similar,0);
  await assert.rejects(similarRange(f.owner,{rooms:2}),/./);
 }finally{f.db.close();}
});
