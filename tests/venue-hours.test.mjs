import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,now as epoch,iso,load} from './helpers/platform.mjs';
const vh=await load('venue-hours');

// «Время работы» (lib/venue-hours.ts): each hall, cafe, bath and sauna sets its own hours and times of events.
const hall=()=>({title:'Зал «Сарыарка»',city:'Павлодар',district:'Центр',address:'PRIVATE HALL ADDRESS',description:'Банкетный зал на двести гостей со сценой, звуком и своей кухней. Халяль, отдельная комната для намаза.',price:400000,rooms:1,capacity:200,cleaningMinutes:30,ownStaff:true,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type:'banquet',area:300,beds:1,bathrooms:2,floor:1,floors:2,checkinMethod:'meet',amenities:['halal'],pets:false,smoking:false,parties:true,menu:'Бешбармак'},
 rental:{hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'12:00',checkoutTime:'00:00',deposit:0,houseRules:'Число гостей уточняется за три дня.',includedGuests:50,extraGuestPrice:8000}});
const bath=()=>({...hall(),title:'Баня на дровах',description:'Баня на дровах с парилкой и купелью, комната отдыха на шесть гостей.',price:36000,capacity:8,cleaningMinutes:30,ownStaff:false,
 details:{type:'banya',area:40,beds:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:['steam'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:3000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина после 23:00.',includedGuests:4,extraGuestPrice:500}});
const rules=(f,id,venueHours)=>{const p=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(id);
 return f.owner.savePolicy(id,{dailyPrice:Number(f.db.raw.prepare('SELECT price FROM properties WHERE id=?').get(id).price),hourlyPrice:p.hourly_price,minHours:p.min_hours,nightlyPrice:0,checkinTime:'12:00',checkoutTime:'00:00',deposit:0,houseRules:p.house_rules,cleaningFee:p.cleaning_fee,cleaningBudget:p.cleaning_budget,includedGuests:p.included_guests,extraGuestPrice:p.extra_guest_price,expectedVersion:p.version,venueHours});};
const open=(f,id)=>{f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(id);f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);};
const day=()=>Math.floor((epoch()+3*86400)/86400)*86400-18000; // local midnight in three days

test('a new hall takes memorial sittings, a той from 15:00 to midnight and the old day and evening',()=>{
 const h=vh.venueHours('banquet','');
 assert.deepEqual(h.sessions.map(vh.sessionLine),['Поминки, 1-й заход 12:00–13:30','Поминки, 2-й заход 14:00–15:30','Поминки, 3-й заход 16:00–17:30','Той 15:00–24:00','Днём 12:00–17:00','Вечер 18:00–24:00']);
 assert.equal(vh.hoursLine(vh.venueHours('banya','')),'Круглосуточно');
 assert.equal(vh.venueHours('apartment',''),null);
});

test('the owner sets the hall times, and a guest books only one of them',async()=>{
 const f=await fixture();try{
  const id=(await f.owner.saveListing(null,hall())).id;open(f,id);
  await assert.rejects(rules(f,id,{open:'10:00',close:'24:00',sessions:[]}),/хотя бы одно/);
  await assert.rejects(rules(f,id,{open:'10:00',close:'23:00',sessions:[{label:'Той',from:'16:00',to:'24:00'}]}),/за время работы/);
  await rules(f,id,{open:'10:00',close:'24:00',sessions:[{label:'Той',from:'16:00',to:'24:00'},{label:'Поминки',from:'12:00',to:'13:30'}]});
  const d=day();
  const q=await f.guest.bookingQuote({propertyId:id,start:iso(d+12*3600),end:iso(d+13.5*3600),guests:60,billingMode:'daily'});
  assert.equal(q.kind,'banquet');
  assert.ok(await f.guest.bookingQuote({propertyId:id,start:iso(d+16*3600),end:iso(d+24*3600),guests:60,billingMode:'daily'}));
  // The old «Днём 12:00–17:00» is gone from this hall.
  await assert.rejects(f.guest.bookingQuote({propertyId:id,start:iso(d+12*3600),end:iso(d+17*3600),guests:60,billingMode:'daily'}),/Той 16:00–24:00/);
  assert.match(JSON.parse(f.db.raw.prepare('SELECT venue_hours FROM property_policies WHERE property_id=?').get(id).venue_hours).sessions[0].label,/Поминки/);
 }finally{f.db.close();}
});

test('a bath with its own hours is booked only inside them; round the clock by default',async()=>{
 const f=await fixture();try{
  const id=(await f.owner.saveListing(null,bath())).id;open(f,id);const d=day();
  assert.ok(await f.guest.bookingQuote({propertyId:id,start:iso(d+26*3600),end:iso(d+28*3600),guests:4,billingMode:'hourly'}));
  await rules(f,id,{open:'10:00',close:'02:00'});
  assert.ok(await f.guest.bookingQuote({propertyId:id,start:iso(d+23*3600),end:iso(d+26*3600),guests:4,billingMode:'hourly'}));
  await assert.rejects(f.guest.bookingQuote({propertyId:id,start:iso(d+27*3600),end:iso(d+29*3600),guests:4,billingMode:'hourly'}),/работает с 10:00 до 02:00/);
 }finally{f.db.close();}
});
