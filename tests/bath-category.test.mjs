import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';

// Категория «Баня»: a bath or a sauna taken whole by the hour (lib/listings.ts categories).
const listing=(type,extra={})=>({title:type==='apartment'?'Квартира в центре':'Баня на дровах',city:'Павлодар',district:'Центр',address:'PRIVATE BATH ADDRESS',description:'Баня на дровах с парилкой и купелью, комната отдыха на шесть человек, мангал во дворе, парковка у ворот.',price:36000,rooms:1,capacity:8,cleaningMinutes:60,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type,area:40,beds:type==='apartment'?8:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:type==='apartment'?['wifi']:['steam','plunge','brooms'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:3000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина после 23:00.',includedGuests:4,extraGuestPrice:500,prepMinutes:120},...extra});
const body=(start,extra={})=>({city:'Павлодар',mode:'hourly',start:iso(start),end:iso(start+3*3600),guests:6,maxPrice:100000000,priority:'balanced',features:[],...extra});

test('a bath is found only in its own category, by the hour, with the surcharge for extra guests in the price',async()=>{
 const f=await fixture();try{
  const bath=(await f.owner.saveListing(null,listing('banya'))).id,flat=(await f.owner.saveListing(null,listing('apartment'))).id;
  // A bath has no beds to count: eight guests with one bed is a valid card.
  assert.equal(JSON.parse(f.db.raw.prepare('SELECT details FROM property_details WHERE property_id=?').get(bath).details).beds,8);
  assert.equal(f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(bath).own_staff,0);
  const policy=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(bath);
  assert.deepEqual([policy.included_guests,policy.extra_guest_price,policy.prep_minutes],[4,500,120]);
  f.db.raw.prepare('UPDATE properties SET published=(id IN (?,?))').run(bath,flat);
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const {previewMatches}=await load('smart-matching'),start=Math.ceil((now()+86400)/3600)*3600;
  const ids=async extra=>(await previewMatches(f.guest,body(start,extra))).properties.map(p=>p.id);
  // «Жильё»: no type named, the bath is not shown. «Баня»: only the bath.
  assert.deepEqual(await ids({guests:2}),[flat]);
  assert.deepEqual(await ids({kinds:['banya','sauna']}),[bath]);
  // Six guests, four in the price: (3 000 + 2 × 500) × 3 hours.
  const found=(await previewMatches(f.guest,body(start,{kinds:['banya','sauna']}))).properties[0];
  assert.equal(found.estimate.amount,12000);assert.equal(found.estimate.rate,4000);
  const four=(await previewMatches(f.guest,body(start,{kinds:['banya'],guests:4}))).properties[0];assert.equal(four.estimate.amount,9000);
  // The booking costs what the search said, and the terms keep the rate with the surcharge.
  const quote=await f.guest.bookingQuote({propertyId:bath,start:iso(start),end:iso(start+3*3600),guests:6,billingMode:'hourly'});
  assert.equal(quote.amount,12000);
  const booking=(await f.guest.createBooking({propertyId:bath,start:iso(start),end:iso(start+3*3600),guests:6,billingMode:'hourly',requestKey:'bath',acceptTerms:true})).id;
  assert.equal(f.db.raw.prepare('SELECT amount FROM bookings WHERE id=?').get(booking).amount,12000);
  assert.deepEqual({...f.db.raw.prepare('SELECT rate,units,amount FROM booking_terms WHERE booking_id=?').get(booking)},{rate:4000,units:3,amount:12000});
 }finally{f.db.close();}
});

test('an older app that sends no guest surcharge keeps the stored one',async()=>{
 const f=await fixture();try{
  const id=(await f.owner.saveListing(null,listing('sauna'))).id;
  assert.equal(f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(id).own_staff,1);
  const p=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(id);
  await f.owner.savePolicy(id,{expectedVersion:p.version,dailyPrice:36000,hourlyPrice:3500,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина',autoConfirm:false,autoAssign:false,cleaningFee:0,cleaningBudget:0});
  const after=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(id);
  assert.deepEqual([after.hourly_price,after.included_guests,after.extra_guest_price,after.prep_minutes],[3500,4,500,120]);
 }finally{f.db.close();}
});

test('«Затопить»: the owner is reminded once, the set time before a confirmed stay',async()=>{
 const f=await fixture();try{
  const id=(await f.owner.saveListing(null,listing('banya'))).id;f.db.raw.prepare('UPDATE properties SET published=1').run();
  const start=Math.ceil((now()+86400)/3600)*3600;
  const booking=(await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+3*3600),guests:5,billingMode:'hourly',requestKey:'heat',acceptTerms:true})).id;
  const {sweepPrep,prepText}=await load('bath-prep');
  const notes=()=>f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:prep:%'").all();
  // Not confirmed yet, then confirmed but too early: nothing.
  assert.equal((await sweepPrep(f.db,start-3600)).reminded,0);
  await f.owner.bookingAction(booking,{action:'confirm'});
  assert.equal((await sweepPrep(f.db,start-3*3600)).reminded,0);
  assert.equal((await sweepPrep(f.db,start-2*3600)).reminded,1);
  assert.equal((await sweepPrep(f.db,start-3600)).reminded,0);
  assert.equal(notes().length,1);assert.match(notes()[0].body,/затопите к \d\d:\d\d\. Гостей: 5, на 3 ч\./);
  assert.match(prepText({title:'Лофт',type:'apartment',start,end:start+7200,guests:2}),/подготовьте/);
 }finally{f.db.close();}
});

test('the line reads a bath: by the hour, the category kept, a flat never becomes a bath',async()=>{
 const {guestSearchRequest,statedKinds}=await load('map-search-request');
 assert.deepEqual(statedKinds('баня на 6 человек'),['banya']);assert.deepEqual(statedKinds('сауна с бассейном'),['sauna']);
 assert.deepEqual(statedKinds('квартира с банкоматом рядом'),[]);
 const at=Date.parse('2026-11-17T10:00:00+05:00'),current={city:'Павлодар',mode:'daily',start:'2026-11-17T14:00',end:'2026-11-18T12:00',guests:'2',kinds:[]};
 const r=guestSearchRequest('баня на 6 человек сегодня в 20:00',current,['Павлодар'],at);
 assert.equal(r.filters.mode,'hourly');assert.equal(r.filters.start,'2026-11-17T20:00');assert.equal(r.filters.end,'2026-11-17T23:00');
 // «Баня» said alone is the whole category (a sauna answers it too); «русская баня» and «сауна» name one kind.
 assert.deepEqual(r.filters.kinds,['banya','sauna']);
 const kinds=text=>guestSearchRequest(text,current,['Павлодар'],at).filters.kinds||[];
 assert.deepEqual(kinds('русская баня на дровах'),['banya']);assert.deepEqual(kinds('сауна на 6 человек'),['sauna']);
 assert.deepEqual(kinds('попариться вечером'),['banya','sauna']);assert.deepEqual(kinds('хаммам'),['banya','sauna']);
 // «Квартира с сауной» is a home that has one: the search stays in «Жильё» and says what it cannot check.
 const home=guestSearchRequest('квартира с сауной',current,['Павлодар'],at);
 assert.deepEqual(home.filters.kinds||[],[]);assert.ok(home.remarks.some(text=>text.includes('баня')));
 assert.deepEqual(kinds('дом с баней'),['house']);
 // A day without an hour is an evening in a bath; an hour with a colon needs no «в»; «до 22:00» is not a start.
 const day=text=>guestSearchRequest(text,current,['Павлодар'],at).filters.start;
 assert.equal(day('баня завтра'),'2026-11-18T19:00');assert.equal(day('сауна послезавтра 20:30'),'2026-11-19T20:30');
 assert.equal(day('квартира завтра до 22:00'),'2026-11-18T14:00');
 const bare=guestSearchRequest('баня',current,['Павлодар'],at);assert.equal(bare.filters.mode,'hourly');
});

test('«баня на сутки» остаётся почасовой, а «с бассейном» становится обязательным удобством', async () => {
  const { guestSearchRequest } = await load('map-search-request');
  const now = Date.parse('2026-11-17T06:00:00Z');
  const day = guestSearchRequest('баня на сутки', { city: 'Павлодар', mode: 'daily', guests: '2' }, ['Павлодар'], now);
  assert.equal(day.filters.mode, 'hourly');
  assert.ok(day.remarks.some(r => r.includes('по часам')));
  const pool = guestSearchRequest('баня с бассейном и вениками завтра в 20:00', { city: 'Павлодар', mode: 'daily', guests: '2' }, ['Павлодар'], now);
  assert.deepEqual(pool.filters.features, ['pool', 'brooms']);
});

test('a bath that takes two hours to heat is not offered or booked sooner, and the empty answer names the first hour',async()=>{
 const f=await fixture();try{
  const bath=(await f.owner.saveListing(null,listing('banya'))).id;
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(bath);
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const {previewMatches}=await load('smart-matching'),soon=Math.ceil((now()+1800)/1800)*1800,later=Math.ceil((now()+2*3600)/1800)*1800+1800;
  const search=async(start,extra={})=>previewMatches(f.guest,body(start,{kinds:['banya','sauna'],...extra}));
  // In half an hour: free, but nobody can heat it by then.
  const early=await search(soon);
  assert.deepEqual(early.properties,[]);
  assert.equal(early.empty.reason,'prep');assert.equal(early.empty.prepMinutes,120);
  assert.ok(Date.parse(early.empty.next.start)/1000>=now()+120*60);
  // The hour the answer names is found, and the guests' own later hour too.
  assert.deepEqual((await previewMatches(f.guest,{...body(soon,{kinds:['banya','sauna']}),start:early.empty.next.start,end:early.empty.next.end})).properties.map(p=>p.id),[bath]);
  assert.deepEqual((await search(later)).properties.map(p=>p.id),[bath]);
  // A booking sooner than the heating is refused in words; the owner who says «готово» may still take it.
  await assert.rejects(f.guest.bookingQuote({propertyId:bath,start:iso(soon),end:iso(soon+3*3600),guests:4,billingMode:'hourly'}),/готовят к приходу гостей 2 ч/);
  assert.equal((await f.guest.bookingQuote({propertyId:bath,start:iso(soon),end:iso(soon+3*3600),guests:4,billingMode:'hourly'},{ownerReady:true})).amount,9000);
  // One hour where two is the least: «минимум 2 часа», not «занято».
  const short=await previewMatches(f.guest,{...body(later,{kinds:['banya','sauna']}),end:iso(later+3600)});
  assert.deepEqual([short.properties.length,short.empty.reason,short.empty.minHours],[0,'minHours',2]);
  // The hour that would be named is taken («Занято»): it is not offered as the nearest start.
  const at=Date.parse(early.empty.next.start)/1000;
  f.db.raw.prepare("INSERT INTO calendar_sources(id,property_id,owner_id,label,url,created_at,provider,external_property_id) VALUES ('busy-src',?,'owner','Занято','',?,'manual','aiqonaq:busy')").run(bath,now());
  f.db.raw.prepare("INSERT INTO external_blocks(id,source_id,property_id,event_uid,start,end) VALUES ('busy-1','busy-src',?,'busy:1',?,?)").run(bath,at,at+3*3600);
  const taken=await search(soon);assert.deepEqual(taken.properties,[]);assert.notEqual(taken.empty.reason,'prep');
 }finally{f.db.close();}
});

test('an empty bath search keeps its category: another kind of bath is offered, and heating is named beside other conditions',async()=>{
 const f=await fixture();try{
  const banya=(await f.owner.saveListing(null,listing('banya'))).id,sauna=(await f.owner.saveListing(null,listing('sauna',{rental:{...listing('sauna').rental,prepMinutes:0}}))).id;
  f.db.raw.prepare('UPDATE properties SET published=(id IN (?,?))').run(banya,sauna);
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const {previewMatches}=await load('smart-matching'),soon=Math.ceil((now()+1800)/1800)*1800,later=Math.ceil((now()+3*3600)/1800)*1800;
  // In half an hour the sauna is free, the bath is not heated yet: asked for the bath alone, the answer says so.
  assert.deepEqual((await previewMatches(f.guest,body(soon,{kinds:['banya','sauna']}))).properties.map(p=>p.id),[sauna]);
  const early=await previewMatches(f.guest,body(soon,{kinds:['banya']}));
  assert.deepEqual([early.properties.length,early.empty.reason,early.empty.prepMinutes],[0,'prep',120]);
  // The bath is taken later; asked for it alone, the sauna of the same category is counted, not the homes.
  await f.guest.createBooking({propertyId:banya,start:iso(later),end:iso(later+3*3600),guests:4,billingMode:'hourly',requestKey:'taken',acceptTerms:true});
  const taken=await previewMatches(f.guest,body(later,{kinds:['banya']}));
  assert.deepEqual([taken.properties.length,taken.empty.reason,taken.empty.blocker,taken.empty.count],[0,'filters','kinds',1]);
 }finally{f.db.close();}
});
