import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';
const {addHall,renameVenue,venueOf,MAX_HALLS}=await load('venue');
const {assignStaff,removeStaff,staffToday}=await load('staff');

// «Заведение с залами» (lib/venue.ts): each hall is an object of its own, the venue is the name they share.
const listing=()=>({title:'Сауна «Жар»',city:'Павлодар',district:'Центр',address:'PRIVATE SAUNA ADDRESS',description:'Сауна с бассейном и комнатой отдыха, три зала на разные компании, парковка у входа, мангал во дворе.',price:48000,rooms:1,capacity:8,cleaningMinutes:30,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type:'sauna',area:60,beds:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:['steam','pool'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:4000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина после 23:00.',includedGuests:4,extraGuestPrice:500,prepMinutes:60}});

test('«Добавить зал»: a copy of a filled hall as a draft, both under one venue',async()=>{
 const f=await fixture();try{
  const first=(await f.owner.saveListing(null,listing())).id;
  await assert.rejects(addHall(f.other,{propertyId:first,title:'Малый зал'}),/недоступен/);
  await assert.rejects(addHall(f.owner,{propertyId:first,title:' сауна «жар» '}),/таким названием/);
  const made=await addHall(f.owner,{propertyId:first,title:'Малый зал'});
  assert.match(made.message,/добавлен черновиком/);
  assert.equal(made.venue.title,'Сауна «Жар»');assert.deepEqual(made.venue.halls.map(h=>h.title),['Сауна «Жар»','Малый зал']);
  const row=f.db.raw.prepare('SELECT * FROM properties WHERE id=?').get(made.id);
  assert.deepEqual([row.title,row.address,row.capacity,row.published,row.own_staff],['Малый зал','PRIVATE SAUNA ADDRESS',8,0,1]);
  const policy=f.db.raw.prepare('SELECT hourly_price,included_guests,prep_minutes,auto_confirm FROM property_policies WHERE property_id=?').get(made.id);
  assert.deepEqual({...policy},{hourly_price:4000,included_guests:4,prep_minutes:60,auto_confirm:0});
  assert.equal(JSON.parse(f.db.raw.prepare('SELECT details FROM property_details WHERE property_id=?').get(made.id).details).type,'sauna');
  // The owner sees the venue on both halls and edits the new one as any object.
  const own=(await f.owner.roleState('owner',{catalog:false})).ownProperties;
  assert.deepEqual(own.filter(p=>p.venue).map(p=>[p.venue.title,p.venue.halls]),[['Сауна «Жар»',2],['Сауна «Жар»',2]]);
  const hall=own.find(p=>p.id===made.id);
  await f.owner.saveListing(made.id,{...listing(),title:'Малый зал',capacity:4,expectedVersion:hall.listing_version,policyVersion:f.db.raw.prepare('SELECT version FROM property_policies WHERE property_id=?').get(made.id).version});
  assert.equal(f.db.raw.prepare('SELECT capacity FROM properties WHERE id=?').get(made.id).capacity,4);
  // A third hall joins the same venue; the venue is renamed for all.
  const third=await addHall(f.owner,{propertyId:made.id,title:'VIP'});assert.equal(third.venue.halls.length,3);
  assert.equal((await renameVenue(f.owner,{propertyId:first,title:'Сауны «Жар»'})).venue.title,'Сауны «Жар»');
  assert.equal((await venueOf(f.db,third.id)).title,'Сауны «Жар»');
  await assert.rejects(renameVenue(f.other,{propertyId:first,title:'X'}),/не найдено/);
  f.db.raw.prepare('UPDATE venue_halls SET venue_id=venue_id').run();
  for(let i=3;i<MAX_HALLS;i++)await addHall(f.owner,{propertyId:first,title:'Зал '+i});
  await assert.rejects(addHall(f.owner,{propertyId:first,title:'Лишний'}),/Больше добавить нельзя/);
 }finally{f.db.close();}
});

test('the guest finds each free hall with the name of the venue; a booked hall leaves the others free',async()=>{
 const f=await fixture();try{
  const first=(await f.owner.saveListing(null,listing())).id,second=(await addHall(f.owner,{propertyId:first,title:'Малый зал'})).id;
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id IN (?,?)').run(first,second);
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);
  const {previewMatches}=await load('smart-matching'),start=Math.ceil((now()+86400)/3600)*3600;
  const ask={city:'Павлодар',mode:'hourly',start:iso(start),end:iso(start+2*3600),guests:4,maxPrice:100000000,priority:'balanced',features:[],kinds:['sauna']};
  const found=(await previewMatches(f.guest,ask)).properties;
  assert.deepEqual(found.map(p=>p.id).sort(),[first,second].sort());
  assert.deepEqual(found.map(p=>[p.venue.title,p.venue.halls]),[['Сауна «Жар»',2],['Сауна «Жар»',2]]);
  const booking=(await f.guest.createBooking({propertyId:first,start:iso(start),end:iso(start+2*3600),guests:4,billingMode:'hourly',requestKey:'hall',acceptTerms:true})).id;
  await f.owner.bookingAction(booking,{action:'confirm'});
  assert.deepEqual((await previewMatches(f.other,ask)).properties.map(p=>p.id),[second]);
 }finally{f.db.close();}
});

test('the person on shift is named for the whole venue, and a new hall gets the same person',async()=>{
 const f=await fixture();try{
  const first=(await f.owner.saveListing(null,listing())).id,second=(await addHall(f.owner,{propertyId:first,title:'Малый зал'})).id;
  f.db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run('cleaner','+77010000003','Айдар','x','x',now());
  const done=await assignStaff(f.owner,{propertyId:second,phone:'+77010000003'});assert.match(done.message,/во всех залах заведения: 2/);
  assert.deepEqual((await staffToday(f.cleaner)).places.map(p=>p.id).sort(),[first,second].sort());
  const third=(await addHall(f.owner,{propertyId:first,title:'VIP'})).id;
  assert.equal((await staffToday(f.cleaner)).places.length,3);
  await removeStaff(f.owner,{propertyId:third});assert.deepEqual((await staffToday(f.cleaner)).places,[]);
 }finally{f.db.close();}
});
