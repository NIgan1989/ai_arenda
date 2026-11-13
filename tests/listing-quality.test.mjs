import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {listingTip,tipText,offerListingTip,TIP_PAUSE}=await load('listing-quality');
const DAY=86400;
const flat=(over={})=>({id:'x',title:'Flat',price:10000,hourly:2000,photos:6,description:300,amenities:['wifi','kitchen'],checkin:'lockbox',bookings:1,...over});

test('the tip names the biggest difference from the flats that are booked more often',()=>{
 const leaders=[flat({photos:9,bookings:5}),flat({photos:8,bookings:4}),flat({photos:10,bookings:3})];
 const t=listingTip(flat({photos:4}),leaders);
 assert.deepEqual([t.kind,t.mine,t.theirs,t.count,t.leaders],['photos',4,9,3,3]);
 assert.match(tipText(t).text,/в среднем 9 фото, у вас 4/);
 assert.equal(listingTip(flat({photos:4}),leaders.slice(0,2)),null,'two flats are too few to compare with');
 assert.equal(listingTip(flat({photos:7}),leaders),null,'close enough');
});

test('an amenity most leaders list, an hourly price, self check-in, a longer description',()=>{
 const leaders=[flat({amenities:['wifi','kitchen','parking','washer']}),flat({amenities:['wifi','parking','washer']}),flat({amenities:['parking','aircon']}),flat({amenities:['wifi','washer']})];
 const a=listingTip(flat(),leaders);
 assert.equal(a.kind,'amenity');assert.equal(a.subject,'washer','washer and parking are equally common: the one guests search first');assert.equal(a.count,3);
 assert.match(tipText(a).text,/У 3 из 4 похожих объектов, которые бронируют чаще, отмечено «стиральная машина»/);assert.equal(tipText(a).accept,'Да, есть');
 assert.equal(listingTip(flat(),leaders,new Set(['amenity:washer'])).subject,'parking','an answered tip is not repeated');
 const hourly=listingTip(flat({hourly:0,price:12000}),[flat({price:10000,hourly:2000}),flat({price:10000,hourly:1500}),flat({price:8000,hourly:2000}),flat({hourly:0})]);
 assert.equal(hourly.kind,'hourly');assert.equal(hourly.value,2400);assert.match(tipText(hourly).accept,/^Сдавать за 2\s400 ₸\/ч$/);
 assert.equal(listingTip(flat({hourly:0,price:12000,minimumRate:3000}),[flat({price:10000,hourly:2000}),flat({price:10000,hourly:1500}),flat({price:8000,hourly:2000})]).value,3000,'never below the minimum rate');
 assert.equal(listingTip(flat({checkin:'meet'}),[flat(),flat({checkin:'smartlock'}),flat({checkin:'meet'})]).kind,'checkin');
 const text=listingTip(flat({description:120}),[flat({description:400}),flat({description:500}),flat({description:350})]);
 assert.equal(text.kind,'text');assert.equal(text.theirs,400);
});

function details(f,id,photos,amenities,checkin='meet'){
 f.db.raw.prepare("INSERT INTO property_details(property_id,details,photos,version,revision,updated_at) VALUES (?,?,?,1,'r',0) ON CONFLICT(property_id) DO UPDATE SET details=excluded.details,photos=excluded.photos").run(id,JSON.stringify({type:'apartment',area:40,beds:2,bathrooms:1,floor:2,floors:5,checkinMethod:checkin,amenities,pets:false,smoking:false,parties:false}),JSON.stringify(Array.from({length:photos},(_,i)=>'m'+id+i)));
}
async function city(f,amenities){
 f.db.raw.prepare('UPDATE properties SET published=1').run();
 details(f,f.property,5,['wifi','kitchen']);
 const t=now(),ids=[];
 for(const n of [1,2,3]){
  const id=(await f.other.createProperty({title:'Leader '+n,city:'Павлодар',district:'Центр',address:'Leader '+n,description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;
  await f.other.savePolicy(id,{...f.policy,expectedVersion:0});details(f,id,6,amenities[n-1]);ids.push(id);
  for(let k=0;k<n+1;k++)f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,'guest',?,?,?,1,10000,'completed',?,'paid',?,?)").run('b'+n+k,id,t-(10+k)*DAY,t-(9+k)*DAY,t-(9+k)*DAY,t,'b'+n+k,t-(12+k)*DAY);
 }
 f.db.raw.prepare('UPDATE properties SET published=1').run();
 return {t,ids};
}

test('«Да, есть» marks the amenity in the listing; one tip at a time',async()=>{
 const f=await fixture();try{
  const {t}=await city(f,[['wifi','kitchen','parking'],['wifi','parking'],['parking','washer']]);
  const id=await offerListingTip(f.db,'owner',t);assert.ok(id);
  const row=f.db.raw.prepare('SELECT * FROM listing_tips WHERE id=?').get(id);
  assert.equal(row.kind,'amenity');assert.equal(row.subject,'parking');assert.equal(row.count,3);assert.equal(row.property_id,f.property);
  assert.match(f.db.raw.prepare('SELECT body FROM notifications WHERE dedupe=?').get('owner:listing:'+id).body,/^Совет по объявлению · «Test apartment»\. У 3 из 3/);
  assert.equal(await offerListingTip(f.db,'owner',t+60),null,'one tip at a time');
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='listing');
  assert.equal(card.listing.amenity,'Парковка');assert.equal(card.acceptLabel,'Да, есть');
  assert.equal((await f.other.roleState('owner')).approvals.some(c=>c.kind==='listing'),false);
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/отмечено «парковка»/);
  assert.deepEqual(JSON.parse(f.db.raw.prepare('SELECT details FROM property_details WHERE property_id=?').get(f.property).details).amenities,['wifi','kitchen','parking']);
  // After the pause the next difference comes; the answered one never repeats.
  assert.equal(await offerListingTip(f.db,'owner',t+DAY),null,'a pause of three days');
  assert.equal(await offerListingTip(f.db,'owner',t+TIP_PAUSE+60),null,'nothing else differs');
 }finally{f.db.close();}
});

test('tips that open the editor, a «Нет», and a tip the owner already followed',async()=>{
 const f=await fixture();try{
  const {t,ids}=await city(f,[['wifi','kitchen','aircon'],['wifi','aircon'],['aircon']]);
  for(const id of ids)f.db.raw.prepare("UPDATE property_details SET photos=? WHERE property_id=?").run(JSON.stringify(Array.from({length:10},(_,i)=>id+i)),id);
  const first=await offerListingTip(f.db,'owner',t);
  assert.equal(f.db.raw.prepare('SELECT kind FROM listing_tips WHERE id=?').get(first).kind,'photos');
  let card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='listing');
  assert.equal(card.acceptLabel,'Добавить фото');assert.equal(card.listing.mine,5);assert.equal(card.listing.theirs,10);
  const open=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});
  assert.deepEqual(open.edit,{propertyId:f.property,step:'photos'});
  const second=await offerListingTip(f.db,'owner',t+TIP_PAUSE+60);
  assert.equal(f.db.raw.prepare('SELECT kind,subject FROM listing_tips WHERE id=?').get(second).subject,'aircon');
  card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='listing');
  const no=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'reject'});assert.match(no.message,/больше не покажу/);
  // The owner adds the amenity on their own while a tip is open: the tip closes quietly.
  f.db.raw.prepare("UPDATE listing_tips SET status='declined',decided_at=0 WHERE id=?").run(second);
  const third=await offerListingTip(f.db,'owner',t+2*TIP_PAUSE+120);assert.ok(third);
  details(f,f.property,5,['wifi','kitchen','aircon']);
  assert.equal((await f.owner.roleState('owner')).approvals.some(c=>c.kind==='listing'),false);
  assert.equal(f.db.raw.prepare('SELECT status FROM listing_tips WHERE id=?').get(third).status,'expired');
 }finally{f.db.close();}
});

test('«Сдавать почасово» sets the hourly price the leaders suggest',async()=>{
 const f=await fixture();try{
  const {t}=await city(f,[['wifi','kitchen'],['wifi','kitchen'],['wifi','kitchen']]);
  f.db.raw.prepare('UPDATE property_policies SET hourly_price=0 WHERE property_id=?').run(f.property);
  const id=await offerListingTip(f.db,'owner',t),row=f.db.raw.prepare('SELECT * FROM listing_tips WHERE id=?').get(id);
  assert.equal(row.kind,'hourly');assert.equal(row.value,2000);
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='listing');
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/почасово/);
  const p=f.db.raw.prepare('SELECT hourly_price,version FROM property_policies WHERE property_id=?').get(f.property);
  assert.equal(p.hourly_price,2000);assert.equal(p.version,row.policy_version+1);
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'}),e=>e.status===409);
 }finally{f.db.close();}
});
