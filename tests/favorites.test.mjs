import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {setFavorite,guestFavorites,favouredFirst,MAX_FAVORITES}=await load('favorites');

const publish=(f,id)=>f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);

test('the heart: a guest saves a published home of another person and takes it back',async()=>{
 const f=await fixture();try{
  publish(f,f.property);
  const on=await setFavorite(f.guest,{propertyId:f.property,on:true});assert.deepEqual(on.favorites,[f.property]);assert.match(on.message,/Добавлено/);
  // Twice is the same heart, not two.
  assert.deepEqual((await setFavorite(f.guest,{propertyId:f.property,on:true})).favorites,[f.property]);
  assert.deepEqual((await f.guest.roleState('guest',{catalog:false})).favorites,[f.property]);
  // Another guest's list is their own.
  assert.deepEqual((await guestFavorites(f.db,'other')).favorites,[]);
  const off=await setFavorite(f.guest,{propertyId:f.property,on:false});assert.deepEqual(off.favorites,[]);assert.match(off.message,/Убрано/);
  await assert.rejects(setFavorite(f.guest,{propertyId:f.property}),/добавить или убрать/);
  await assert.rejects(setFavorite(f.guest,{propertyId:'nope',on:true}),/недоступно/);
  await assert.rejects(setFavorite(f.owner,{propertyId:f.property,on:true}),/./);
 }finally{f.db.close();}
});

test('a home that left the catalogue leaves the favourites; the list is capped',async()=>{
 const f=await fixture();try{
  publish(f,f.property);await setFavorite(f.guest,{propertyId:f.property,on:true});
  f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
  assert.deepEqual((await guestFavorites(f.db,'guest')).favorites,[]);
  await assert.rejects(setFavorite(f.guest,{propertyId:f.property,on:true}),/недоступно/);
  publish(f,f.property);f.db.raw.prepare('DELETE FROM guest_favorites').run();
  for(let i=0;i<MAX_FAVORITES;i++){const id=(await f.owner.createProperty({title:'Home '+i,city:'Павлодар',district:'Центр',address:'A',description:'T',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;f.db.raw.prepare('INSERT INTO guest_favorites VALUES (?,?,?)').run('guest',id,now());}
  await assert.rejects(setFavorite(f.guest,{propertyId:f.property,on:true}),/Уберите лишние/);
  // Homes that left the catalogue cannot be taken back in the app, so they do not use up the allowance.
  f.db.raw.prepare("UPDATE properties SET published=0 WHERE title='Home 0'").run();
  assert.equal((await setFavorite(f.guest,{propertyId:f.property,on:true})).favorites.length,MAX_FAVORITES);
 }finally{f.db.close();}
});

test('«Снова туда же»: a home of a finished stay is remembered, an unfinished one is not',async()=>{
 const f=await fixture();try{
  publish(f,f.property);
  assert.deepEqual((await guestFavorites(f.db,'guest')).stayed,[]);
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  const mine=await guestFavorites(f.db,'guest');assert.deepEqual(mine.stayed,[f.property]);assert.deepEqual(mine.favorites,[]);
  assert.deepEqual((await f.guest.roleState('guest',{catalog:false})).stayed,[f.property]);
 }finally{f.db.close();}
});

test('favourites go first, then homes of earlier stays, the rest keep their order',()=>{
 const list=['a','b','c','d','e'].map(id=>({id}));
 assert.deepEqual(favouredFirst(list,{favorites:['d'],stayed:['c','d']}).map(p=>p.id),['d','c','a','b','e']);
 assert.deepEqual(favouredFirst(list,{favorites:[],stayed:[]}).map(p=>p.id),['a','b','c','d','e']);
});
