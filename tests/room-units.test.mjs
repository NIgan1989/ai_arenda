import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {setRoomCount,setFreeToday,roomState,askFreeRooms}=await load('room-units');
const {RentalService}=await load('service');
const guestNamed=async(f,id)=>{const g=new RentalService(f.db,id);await g.saveProfile({name:'Guest '+id,roles:['guest'],city:'Павлодар',contact:'test',districts:'Центр',experience:'Experienced',availability:'By agreement'});return g;};
// «Номера одного типа» (2026-11-22): one card, many rooms alike; the guest sees how many are free.
const asHotel=f=>f.db.raw.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,?,'t',0) ON CONFLICT(property_id) DO UPDATE SET details=excluded.details").run(f.property,JSON.stringify({type:'hotel'}));
const dayAt=(days,hour)=>Math.floor((now()+18000)/86400+days)*86400-18000+hour*3600;
const search=(f,start,end)=>f.guest.publicSearch({city:'Павлодар',mode:'daily',guests:'1',start:iso(start),end:iso(end)});

test('a hotel card of three rooms is one card that books three guests and then is full',async()=>{
 const f=await fixture();try{
  await assert.rejects(setRoomCount(f.owner,{propertyId:f.property,count:3}),/гостиницы, хостела/);
  asHotel(f);
  assert.match((await setRoomCount(f.owner,{propertyId:f.property,count:3})).message,/Таких номеров: 3/);
  const start=dayAt(5,14),end=dayAt(6,12);
  let found=(await search(f,start,end)).properties.filter(p=>p.title==='Test apartment');
  assert.equal(found.length,1);assert.deepEqual(found[0].units,{total:3,free:3});
  const ids=new Set();
  for(const key of ['a','b','c']){const g=await guestNamed(f,'g-'+key),b=await g.createBooking({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'daily',requestKey:key,acceptTerms:true});ids.add(f.db.raw.prepare('SELECT property_id FROM bookings WHERE id=?').get(b.id).property_id);}
  assert.equal(ids.size,3,'each guest takes a room of their own');
  await assert.rejects((await guestNamed(f,'g-d')).createBooking({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'daily',requestKey:'d',acceptTerms:true}),/занят/);
  assert.equal((await search(f,start,end)).properties.filter(p=>p.title==='Test apartment').length,0);
  // The owner sees one card with the count, never the copies.
  const own=(await f.owner.roleState('owner')).ownProperties.filter(p=>p.title==='Test apartment');
  assert.equal(own.length,1);assert.equal(own[0].units.total,3);
  // Rooms with stays ahead are not taken away.
  await assert.rejects(setRoomCount(f.owner,{propertyId:f.property,count:1}),/не меньше 3/);
 }finally{f.db.close();}
});
test('the owner closes rooms for today by saying how many are free in the hotel system',async()=>{
 const f=await fixture();try{
  asHotel(f);await setRoomCount(f.owner,{propertyId:f.property,count:4});
  const r=await setFreeToday(f.owner,{propertyId:f.property,free:1});
  assert.equal(r.rooms.total,4);assert.ok(r.rooms.free<=1);
  // Asked again, the last answer counts: two free now.
  const again=await setFreeToday(f.owner,{propertyId:f.property,free:2});
  assert.equal(again.rooms.free+again.rooms.taken+again.rooms.closed,4);assert.ok(again.rooms.free<=2);
  assert.deepEqual(await roomState(f.db,f.property),again.rooms);
  // Price and rules follow the card: a new price reaches every room at the next quote.
  f.db.raw.prepare('UPDATE properties SET price=20000 WHERE id=?').run(f.property);
  const start=dayAt(5,14),end=dayAt(6,12),q=await f.guest.bookingQuote({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'daily'});
  assert.equal(q.amount,20000);
 }finally{f.db.close();}
});
test('each morning the owner of a room card is asked once how many rooms are free',async()=>{
 const f=await fixture();try{
  asHotel(f);await setRoomCount(f.owner,{propertyId:f.property,count:2});
  assert.equal((await askFreeRooms(f.db,dayAt(1,8))).asked,0,'not before nine');
  assert.equal((await askFreeRooms(f.db,dayAt(1,9))).asked,1);
  assert.equal((await askFreeRooms(f.db,dayAt(1,15))).asked,0,'once a day');
  assert.equal((await askFreeRooms(f.db,dayAt(2,10))).asked,1,'and again the next day');
  const n=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE 'owner:rooms-free:%'").all(f.owner.userId);
  assert.equal(n.length,2);assert.match(n[0].body,/Сколько номеров «Test apartment» свободно сегодня\? Всего 2/);
 }finally{f.db.close();}
});
test('the card keeps its own number of rooms beside the count of rooms alike',async()=>{
 const f=await fixture();try{
  asHotel(f);f.db.raw.prepare('UPDATE properties SET rooms=2 WHERE id=?').run(f.property);await setRoomCount(f.owner,{propertyId:f.property,count:3});
  const own=(await f.owner.roleState('owner')).ownProperties.find(p=>p.title==='Test apartment');
  assert.equal(own.rooms,2);assert.equal(own.units.total,3);
  const start=dayAt(5,14),end=dayAt(6,12),found=(await search(f,start,end)).properties.find(p=>p.title==='Test apartment');
  assert.equal(found.rooms,2);assert.equal(found.units.total,3);
 }finally{f.db.close();}
});
