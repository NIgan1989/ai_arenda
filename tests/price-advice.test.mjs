import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {advisePrice,weekendPeak,offerPriceAdvice,PRICE_COOLDOWN}=await load('price-advice');
const {pushPayload}=await load('web-push');
const calm={daily:10000,hourly:2000,nightly:9000,minimumRate:0,requests:0,bookings:0,freeFlats:4,occupancy:.4,upcoming:1,median:null,similar:0,peak:false};

test('the advice stays silent when the price fits the moment',()=>{
 assert.equal(advisePrice(calm),null);
 assert.equal(advisePrice({...calm,requests:2,freeFlats:4}),null,'some demand is not a peak');
});

test('high demand suggests raising the price, capped near similar flats',()=>{
 const up=advisePrice({...calm,requests:6,bookings:1,freeFlats:2});
 assert.equal(up.direction,'up');assert.equal(up.daily,11500);assert.equal(up.percent,15);assert.equal(up.hourly,2300);assert.equal(up.nightly,10500);
 assert.ok(up.reasons.some(r=>/6 запросов/.test(r)));assert.ok(up.reasons.some(r=>/Свободных квартир: 2/.test(r)));
 // Already well above similar flats: no push to go higher.
 assert.equal(advisePrice({...calm,requests:6,freeFlats:1,median:8000,similar:4}),null);
 // Close to the market: the rise stops at 125% of the median.
 const capped=advisePrice({...calm,daily:9000,hourly:0,nightly:0,requests:9,freeFlats:1,median:8000,similar:5,peak:true});
 assert.equal(capped.daily,10000);assert.equal(capped.percent,11);assert.equal(capped.hourly,0);assert.ok(capped.reasons.some(r=>/Выходные/.test(r)));assert.ok(capped.reasons.some(r=>/8\s000/.test(r)));
 // A busy flat is a demand signal too.
 assert.equal(advisePrice({...calm,occupancy:.9}).direction,'up');
});

test('a quiet market suggests lowering, never below the minimum rate or far below similar flats',()=>{
 const down=advisePrice({...calm,occupancy:.05,upcoming:0,median:10000,similar:3,daily:14000});
 assert.equal(down.direction,'down');assert.equal(down.daily,12000);assert.equal(down.percent,14);
 const floor=advisePrice({...calm,occupancy:.05,upcoming:0,median:null,minimumRate:9500});
 assert.equal(floor.daily,9500);
 assert.equal(advisePrice({...calm,occupancy:.05,upcoming:0,median:null,minimumRate:9800}),null,'a change under 3% is not worth a question');assert.ok(floor.hourly>=0&&floor.nightly>=9000);
 assert.equal(advisePrice({...calm,occupancy:.05,upcoming:1}),null,'a booking in the next two days keeps the price');
 assert.equal(advisePrice({...calm,occupancy:.05,upcoming:0,median:10000,similar:3,daily:14000,requestsDay:2}),null,'guests asked earlier today: not a quiet day');
 assert.equal(advisePrice({...calm,occupancy:.05,upcoming:0,peak:true}),null,'no discounts at the weekend');
});

test('weekend peak follows Almaty time',()=>{
 assert.equal(weekendPeak(Date.UTC(2026,10,13,12)/1000),true,'Friday 17:00 in Almaty');
 assert.equal(weekendPeak(Date.UTC(2026,10,11,12)/1000),false,'Wednesday');
});

test('finished stays count towards the flat\'s load',async()=>{
 const f=await fixture();try{
  const {priceSignals}=await load('price-advice'),t=now();
  f.db.raw.prepare("UPDATE bookings SET status='completed',start=?,end=?,occupied_until=? WHERE id=?").run(t-7*86400,t-3600,t-3600,f.booking);
  const p=f.db.raw.prepare('SELECT * FROM properties WHERE id=?').get(f.property),pol=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(f.property);
  const s=await priceSignals(f.db,p,pol,t);assert.ok(s.occupancy>0.45,'a week of a finished stay is half of two weeks');
 }finally{f.db.close();}
});

async function hotMarket(f){
 f.db.raw.prepare('UPDATE properties SET published=1').run();
 for(const [i,price] of [12000,13000,14000].entries()){const id=(await f.other.createProperty({title:'Сосед '+i,city:'Павлодар',district:'Центр',address:'QA',description:'QA',price,rooms:1,capacity:2,cleaningMinutes:90})).id;f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);}
 for(let i=0;i<6;i++)f.db.raw.prepare("INSERT INTO matching_requests(id,guest_id,request_key,filters,status,created_at,expires_at) VALUES (?,?,?,?,'searching',?,?)").run('req'+i,'guest','k'+i,JSON.stringify({city:'Павлодар'}),now()-600,now()+600);
 // The cleaning is done and waits for the owner.
 f.db.raw.prepare("UPDATE cleaning_jobs SET status='submitted',assigned_to='cleaner',submitted_at=? WHERE id=?").run(now(),f.job.id);
 f.db.raw.prepare("UPDATE property_operations SET readiness='inspection',active_booking_id=NULL WHERE property_id=?").run(f.property);
}

test('after the owner accepts the cleaning, the AI suggests a price with a push, and nothing changes until the button',async()=>{
 const f=await fixture();try{
  await hotMarket(f);
  const job=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
  const approved=await f.owner.jobAction(f.job.id,{action:'approve',expectedVersion:job.version});
  assert.ok(approved.priceSuggestion,'a suggestion is made at the moment the flat is ready');assert.match(approved.message,/новую цену/);
  const s=f.db.raw.prepare('SELECT * FROM price_suggestions').get();
  assert.equal(s.direction,'up');assert.equal(s.from_daily,10000);assert.ok(s.to_daily>10000&&s.to_daily<=16500);
  assert.equal(f.db.raw.prepare('SELECT price FROM properties WHERE id=?').get(f.property).price,10000,'the price is untouched without the owner');
  const note=f.db.raw.prepare("SELECT * FROM notifications WHERE dedupe=?").get('owner:price:'+s.id);assert.match(note.body,/Без вашего согласия/);
  // The push carries the question and both answers.
  const push=JSON.parse(pushPayload('owner',false,false,{...s,title:'Test apartment'}));assert.equal(push.kind,'price');assert.equal(push.decision.id,'price:'+s.id);assert.match(push.decision.accept,/Поднять до/);
  assert.equal(JSON.parse(pushPayload('owner',false,false,{...s,status:'accepted',title:'x'})).kind,undefined,'an answered advice is not pushed again');
  // Only the owner sees the card; a guest or another owner cannot answer it.
  const state=await f.owner.roleState('owner'),card=state.approvals.find(c=>c.kind==='price');
  assert.ok(card&&card.price.to===s.to_daily);assert.equal(state.approvals[0].kind,'price');
  assert.equal((await f.other.roleState('owner')).approvals.some(c=>c.kind==='price'),false);
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:'stale',action:'accept'}),e=>e.status===409);
  const result=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});assert.match(result.message,/за сутки/);
  const after=f.db.raw.prepare('SELECT p.price,pp.hourly_price,pp.nightly_price,pp.version FROM properties p JOIN property_policies pp ON pp.property_id=p.id WHERE p.id=?').get(f.property);
  assert.deepEqual([after.price,after.hourly_price,after.nightly_price],[s.to_daily,s.to_hourly,s.to_nightly]);assert.equal(after.version,s.policy_version+1);
  assert.equal(f.db.raw.prepare('SELECT status FROM price_suggestions').get().status,'accepted');
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'}),e=>e.status===409);
  // Not more often than once in three days.
  assert.equal(await offerPriceAdvice(f.db,f.property),null);
 }finally{f.db.close();}
});

test('a declined advice leaves the price, pauses the same advice, and an outdated one expires',async()=>{
 const f=await fixture();try{
  await hotMarket(f);f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(f.property);
  const t=now(),first=await offerPriceAdvice(f.db,f.property,t);assert.ok(first);
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='price');
  await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'reject'});
  assert.equal(f.db.raw.prepare('SELECT price FROM properties WHERE id=?').get(f.property).price,10000);
  // Past the cooldown the same "raise" is still on pause after a "leave it".
  f.db.raw.prepare('UPDATE price_suggestions SET created_at=created_at-?,decided_at=?').run(PRICE_COOLDOWN+60,t);
  assert.equal(await offerPriceAdvice(f.db,f.property,t+60),null);
  // A week later it may come back; if the owner changes the tariffs meanwhile, the open advice closes itself.
  const later=t+8*86400;f.db.raw.prepare('UPDATE matching_requests SET created_at=?').run(later-600);const second=await offerPriceAdvice(f.db,f.property,later);assert.ok(second);
  f.db.raw.prepare('UPDATE property_policies SET version=version+1 WHERE property_id=?').run(f.property);
  const state=await f.owner.roleState('owner');assert.equal(state.approvals.some(c=>c.kind==='price'),false);
  assert.equal(f.db.raw.prepare('SELECT status FROM price_suggestions WHERE id=?').get(second).status,'expired');
 }finally{f.db.close();}
});

test('two "leave it" answers in a row mute the advice for two weeks',async()=>{
 const f=await fixture();try{
  await hotMarket(f);const t=now();
  for(const [i,dir] of ['up','down'].entries())f.db.raw.prepare("INSERT INTO price_suggestions(id,property_id,owner_id,direction,percent,policy_version,from_daily,to_daily,from_hourly,to_hourly,from_nightly,to_nightly,status,created_at,expires_at,decided_at) VALUES (?,?,?,?,10,1,10000,11000,0,0,0,0,'declined',?,?,?)").run('old'+i,f.property,'owner',dir,t-10*86400+i,t,t-86400);
  assert.equal(await offerPriceAdvice(f.db,f.property,t),null);
  f.db.raw.prepare('UPDATE matching_requests SET created_at=?').run(t+14*86400-600);assert.ok(await offerPriceAdvice(f.db,f.property,t+14*86400));
 }finally{f.db.close();}
});
