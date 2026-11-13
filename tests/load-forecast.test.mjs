import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {forecastWeek,weekSummary,adviseWeek,weekStart,localDay,offerWeeklyForecast}=await load('load-forecast');
const {pushPayload}=await load('web-push');
const DAY=86400,H=3600;
// Monday 16 November 2026, midnight in Almaty.
const monday=Date.UTC(2026,10,15,19)/1000;
const evening=(day,i)=>day+i*DAY+21*H;
// A stay covering the evening of day `i` of the week `weeksAgo` weeks before `monday`.
const stay=(id,i,weeksAgo=0)=>({property_id:id,start:evening(monday-weeksAgo*7*DAY,i)-3*H,end:evening(monday-weeksAgo*7*DAY,i)+15*H});

test('the week starts on Monday in Almaty',()=>{
 assert.equal(weekStart(monday+3*DAY+10*H),monday);
 assert.equal(weekStart(monday-H),monday-7*DAY,'Sunday 23:00 is still last week');
 assert.equal(localDay(monday+DAY+23*H),monday+DAY);
});

test('busy and quiet evenings come from the usual weekday load and what is booked already',()=>{
 const stays=[];
 // Over the last four weeks Friday and Saturday were full in all three flats.
 for(let w=1;w<=4;w++)for(const id of ['a','b','c'])for(const i of [4,5])stays.push(stay(id,i,w));
 // Tuesday is already booked in two flats this week.
 stays.push(stay('a',1),stay('b',1));
 const days=forecastWeek(stays,3,monday);
 assert.deepEqual(days.map(d=>d.label),['Пн','Вт','Ср','Чт','Пт','Сб','Вс']);
 assert.deepEqual(days.map(d=>d.date),[16,17,18,19,20,21,22]);
 assert.deepEqual(days.map(d=>d.level),['quiet','normal','quiet','quiet','busy','busy','quiet']);
 assert.equal(days[1].load,67);assert.equal(days[1].booked,67);assert.equal(days[4].load,100);assert.equal(days[4].booked,0);
 assert.equal(weekSummary(days),'Пт, Сб почти заняты в городе, Пн, Ср, Чт, Вс тихие');
 assert.equal(weekSummary(days.map(d=>({...d,level:'quiet'}))),'Вся неделя тихая');
 assert.equal(weekSummary(days.map(d=>({...d,level:'normal'}))),'Неделя обычная, без пиков и провалов');
});

const days=forecastWeek([...[1,2,3,4].flatMap(w=>['a','b','c'].flatMap(id=>[stay(id,4,w),stay(id,5,w)]))],3,monday);
const flat={id:'p',title:'Студия',price:10000,hourly:2000,nightly:9000,minHours:2,minimumRate:0,median:null,free:[true,true,true,true,true,true,true]};

test('free on busy days: raise the price, capped near similar flats',()=>{
 const up=adviseWeek(days,[flat]);
 assert.equal(up.advice,'raise');assert.equal(up.to,11000);assert.equal(up.percent,10);assert.equal(up.toHourly,2200);assert.equal(up.toNightly,10000);
 assert.ok(up.reasons.some(r=>/Пт, Сб: в городе занято 100%/.test(r)));
 assert.equal(adviseWeek(days,[{...flat,median:9000}]).to,11000);
 assert.equal(adviseWeek(days,[{...flat,median:8000}]).advice,'min_hours','already above similar flats: no raise, the quiet weekdays still get a shorter minimum');
 assert.equal(adviseWeek(days,[{...flat,hourly:0,median:8000}]).advice,'none','busy days ahead: never a lower price');
 assert.equal(adviseWeek(days,[{...flat,free:[true,true,true,true,false,true,true]}]).advice,'min_hours','one free busy day is not enough to raise');
 assert.equal(adviseWeek(days,[{...flat,priceLocked:true}]).advice,'min_hours','a fresh price question blocks another one');
});

test('a quiet week: a shorter minimum stay first, a lower price only above similar flats',()=>{
 const quiet=days.map(d=>({...d,level:'quiet',load:10}));
 const min=adviseWeek(quiet,[{...flat,minHours:4}]);
 assert.equal(min.advice,'min_hours');assert.equal(min.from,4);assert.equal(min.to,2);
 assert.equal(adviseWeek(quiet,[flat]).to,1);
 const down=adviseWeek(quiet,[{...flat,hourly:0,median:8000}]);
 assert.equal(down.advice,'lower');assert.equal(down.to,9000);assert.equal(down.toNightly,8000);
 assert.equal(adviseWeek(quiet,[{...flat,hourly:0,median:8000,minimumRate:9500}]).to,9500,'never below the minimum rate');
 assert.equal(adviseWeek(quiet,[{...flat,hourly:0,median:10000}]).advice,'none','priced like similar flats: nothing to lower');
 assert.equal(adviseWeek(quiet,[{...flat,free:[false,false,false,false,false,true,true]}]).advice,'none','booked most of the week');
});

function insertStay(f,propertyId,start,end,key){
 f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,'guest',?,?,?,1,10000,'completed',?,'paid',?,?)").run(key,propertyId,start,end,end,start,key,start-DAY);
}
async function city(f){
 f.db.raw.prepare('UPDATE properties SET published=1').run();
 const flats=[f.property];
 for(const n of [1,2]){const id=(await f.other.createProperty({title:'Other '+n,city:'Павлодар',district:'Центр',address:'Other '+n,description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;await f.other.savePolicy(id,{...f.policy,expectedVersion:0});flats.push(id);}
 f.db.raw.prepare('UPDATE properties SET published=1').run();
 return flats;
}

test('on Monday the owner gets the week: busy evenings and a higher price for the free flat',async()=>{
 const f=await fixture();try{
  const flats=await city(f),week=weekStart(now())+7*DAY,t=week+10*H;
  for(let w=1;w<=4;w++)for(const id of flats)for(const i of [4,5,6]){const e=week-w*7*DAY+i*DAY+21*H;insertStay(f,id,e-3*H,e+12*H,'h'+w+i+id);}
  assert.equal(await offerWeeklyForecast(f.db,'owner',week+8*H),null,'not before 09:00 on Monday');
  const id=await offerWeeklyForecast(f.db,'owner',t);assert.ok(id);
  assert.equal(await offerWeeklyForecast(f.db,'owner',t+DAY),null,'once a week');
  const row=f.db.raw.prepare('SELECT * FROM load_forecasts WHERE id=?').get(id);
  assert.equal(row.advice,'raise');assert.equal(row.property_id,f.property);assert.equal(row.from_value,10000);assert.ok(row.to_value>10000);assert.equal(row.expires_at,week+7*DAY);
  const note=f.db.raw.prepare('SELECT * FROM notifications WHERE dedupe=?').get('owner:forecast:'+id);
  assert.match(note.body,/^Прогноз на неделю · Пт, Сб, Вс почти заняты в городе/);assert.match(note.body,/Без вашего согласия/);
  const push=JSON.parse(pushPayload('owner',false,false,null,null,null,{...row,title:'Test apartment'}));
  assert.equal(push.kind,'forecast');assert.equal(push.decision.id,'forecast:'+id);assert.match(push.decision.accept,/^Поднять до/);
  // The forecast card is the owner's only, and goes stale when the tariffs change.
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='forecast');
  assert.ok(card);assert.equal(card.forecast.days.length,7);assert.equal(card.forecast.advice,'raise');assert.equal(card.forecast.days.filter(d=>d.level==='busy').length,3);
  assert.equal((await f.other.roleState('owner')).approvals.some(c=>c.kind==='forecast'),false);
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:'stale',action:'accept'}),e=>e.status===409);
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/теперь/);
  const p=f.db.raw.prepare('SELECT p.price,pp.hourly_price,pp.version FROM properties p JOIN property_policies pp ON pp.property_id=p.id WHERE p.id=?').get(f.property);
  assert.equal(p.price,row.to_value);assert.equal(p.hourly_price,row.to_hourly);assert.equal(p.version,row.policy_version+1);
  assert.equal(f.db.raw.prepare('SELECT status FROM load_forecasts WHERE id=?').get(id).status,'accepted');
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'}),e=>e.status===409);
 }finally{f.db.close();}
});

test('a quiet week: a shorter minimum stay, and stale advice closes itself',async()=>{
 const f=await fixture();try{
  const flats=await city(f),week=weekStart(now())+14*DAY,t=week+10*H;
  insertStay(f,flats[1],week-20*DAY,week-19*DAY,'old');
  const id=await offerWeeklyForecast(f.db,'owner',t);
  const row=f.db.raw.prepare('SELECT * FROM load_forecasts WHERE id=?').get(id);
  assert.equal(row.advice,'min_hours');assert.equal(row.from_value,2);assert.equal(row.to_value,1);
  assert.match(f.db.raw.prepare('SELECT body FROM notifications WHERE dedupe=?').get('owner:forecast:'+id).body,/Вся неделя тихая.*от 1 ч вместо 2 ч/);
  const state=await f.owner.roleState('owner'),card=state.approvals.find(c=>c.kind==='forecast');
  assert.equal(card.acceptLabel,'От 1 ч');
  // The owner changed the rules in the meantime: the question disappears.
  f.db.raw.prepare('UPDATE property_policies SET version=version+1 WHERE property_id=?').run(f.property);
  assert.equal((await f.owner.roleState('owner')).approvals.some(c=>c.kind==='forecast'),false);
  assert.equal(f.db.raw.prepare('SELECT status FROM load_forecasts WHERE id=?').get(id).status,'expired');
  // Next week, a fresh forecast: «Оставить» keeps the rules, the button changes them.
  const next=await offerWeeklyForecast(f.db,'owner',t+7*DAY);assert.ok(next);
  const again=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='forecast');
  const r=await f.owner.decideApproval('owner',{id:again.id,revision:again.revision,action:'accept'});assert.match(r.message,/от 1 ч/);
  assert.equal(f.db.raw.prepare('SELECT min_hours FROM property_policies WHERE property_id=?').get(f.property).min_hours,1);
  const third=await offerWeeklyForecast(f.db,'owner',t+14*DAY);
  f.db.raw.prepare('UPDATE property_policies SET min_hours=4 WHERE property_id=?').run(f.property);
  assert.ok(third);const last=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='forecast');
  const no=await f.owner.decideApproval('owner',{id:last.id,revision:last.revision,action:'reject'});assert.match(no.message,/оставляем/);
  assert.equal(f.db.raw.prepare('SELECT min_hours FROM property_policies WHERE property_id=?').get(f.property).min_hours,4);
 }finally{f.db.close();}
});
