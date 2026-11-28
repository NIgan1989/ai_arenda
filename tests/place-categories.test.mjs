import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';

// «Досуг», «Спорт», «Авто» (2026-11-28): places taken whole by the hour, as a bath is, inside their own hours.
const listing=(type,extra={})=>({title:type==='apartment'?'Квартира в центре':'Место для отдыха',city:'Павлодар',district:'Центр',address:'PRIVATE PLACE ADDRESS',description:'Просторное место на час и больше: свет, звук, парковка у входа, рядом остановка. Принимаем компании и команды.',price:60000,rooms:1,capacity:type==='carwash'?1:type==='apartment'?4:10,cleaningMinutes:30,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type,area:80,beds:type==='apartment'?4:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:[],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:5000,minHours:1,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Приходите вовремя.',includedGuests:0,extraGuestPrice:0},...extra});
// Tomorrow at a given hour, Kazakhstan time (UTC+5).
const at=hour=>{const day=Math.floor((now()+5*3600)/86400)*86400+86400;return day-5*3600+hour*3600;};

test('a loft, a field and a car wash: each in its own category, by the hour, with own staff, inside the hours of its kind',async()=>{
 const f=await fixture();try{
  const loft=(await f.owner.saveListing(null,listing('loft'))).id,field=(await f.owner.saveListing(null,listing('field'))).id,wash=(await f.owner.saveListing(null,listing('carwash'))).id,flat=(await f.owner.saveListing(null,listing('apartment'))).id;
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  for(const id of [loft,field,wash])assert.equal(f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(id).own_staff,1);
  assert.equal(f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(flat).own_staff,0);
  const {previewMatches}=await load('smart-matching'),start=at(19);
  const ids=async(kinds,guests=1)=>(await previewMatches(f.guest,{city:'Павлодар',mode:'hourly',start:iso(start),end:iso(start+2*3600),guests,maxPrice:100000000,priority:'balanced',features:[],kinds})).properties.map(p=>p.id);
  assert.deepEqual(await ids(['loft','photostudio']),[loft]);
  assert.deepEqual(await ids(['field','court']),[field]);
  assert.deepEqual(await ids(['carwash','tires']),[wash]);
  // «Жильё» never shows them.
  assert.ok(!(await ids([],2)).some(id=>[loft,field,wash].includes(id)));
  // By the hour only; the price is the hour's.
  const quote=await f.guest.bookingQuote({propertyId:loft,start:iso(start),end:iso(start+2*3600),guests:6,billingMode:'hourly'});
  assert.equal(quote.amount,10000);
  await assert.rejects(f.guest.bookingQuote({propertyId:loft,start:iso(start),end:iso(start+2*3600),guests:6,billingMode:'daily'}),/по часам/);
  // A car wash works 09:00–21:00 by default: a night wash is refused, a morning one is taken.
  await assert.rejects(f.guest.bookingQuote({propertyId:wash,start:iso(at(22)),end:iso(at(23)),guests:1,billingMode:'hourly'}),/работает с 09:00 до 21:00/);
  assert.equal((await f.guest.bookingQuote({propertyId:wash,start:iso(at(10)),end:iso(at(11)),guests:1,billingMode:'hourly'})).amount,5000);
 }finally{f.db.close();}
});

test('the guest\'s words name the new places, and a bath with billiards stays a bath',async()=>{
 const {statedKinds}=await load('map-search-request');
 assert.deepEqual(statedKinds('автомойка завтра в 10'),['carwash']);
 assert.deepEqual(statedKinds('нужен шиномонтаж'),['tires']);
 assert.deepEqual(statedKinds('сто рядом'),['carservice']);
 assert.deepEqual(statedKinds('банкетный зал на сто гостей'),['banquet']);
 assert.deepEqual(statedKinds('фотостудия на 2 часа'),['photostudio']);
 assert.deepEqual(statedKinds('мини-футбол на 10 человек'),['field']);
 assert.deepEqual(statedKinds('баня с бильярдом'),['banya']);
 assert.deepEqual(statedKinds('квартира с караоке'),[]);
 assert.deepEqual(statedKinds('караоке на вечер'),['karaoke_room']);
});

test('the owner\'s story names the kind, the hourly price and the name of the place',async()=>{
 const {readListingText,emptyDraft,draftListingBody,draftKind}=await load('listing-draft');
 const wash=readListingText('Автомойка «Жылдам» на Лесной 5, район Центр. Есть кафе и зона ожидания. 5 000 в час.',emptyDraft('Павлодар')).draft;
 assert.equal(wash.type,'carwash');assert.equal(wash.hourlyPrice,5000);assert.equal(wash.capacity,1);assert.equal(wash.ownStaff,true);
 assert.equal(draftKind(wash),'Автомойка');
 assert.match(wash.title,/Жылдам/);
 assert.deepEqual(draftListingBody(wash,[],false).details.amenities,['waitroom']);
 const field=readListingText('Мини-футбольное поле, крытое, раздевалка и душ, 12 000 в час.',emptyDraft('Павлодар')).draft;
 assert.equal(field.type,'field');assert.equal(field.hourlyPrice,12000);
 const bath=readListingText('Баня с бильярдом и караоке, 5 000 в час.',emptyDraft('Павлодар')).draft;
 assert.equal(bath.type,'banya');
});

test('«N одинаковых»: three football pitches under one card, each guest gets the next free one',async()=>{
 const f=await fixture();try{
  const {setRoomCount}=await load('room-units');
  const field=(await f.owner.saveListing(null,listing('field'))).id;
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  assert.match((await setRoomCount(f.owner,{propertyId:field,count:3})).message,/Таких мест: 3/);
  const start=at(19),book=key=>f.guest.createBooking({propertyId:field,start:iso(start),end:iso(start+3600),guests:10,billingMode:'hourly',requestKey:key,acceptTerms:true});
  // One guest holds one unpaid request at a time: the others come from new guests of the same fixture.
  const first=(await book('a')).id;
  const taken=f.db.raw.prepare('SELECT property_id FROM bookings WHERE id=?').get(first).property_id;
  assert.equal(taken,field);
  const {previewMatches}=await load('smart-matching');
  const found=(await previewMatches(f.guest,{city:'Павлодар',mode:'hourly',start:iso(start),end:iso(start+3600),guests:1,maxPrice:100000000,priority:'balanced',features:[],kinds:['field']})).properties;
  assert.equal(found.length,1);assert.deepEqual(found[0].units,{total:3,free:2});
  // A bath is not sold as many alike.
  const bath=(await f.owner.saveListing(null,listing('banya'))).id;
  await assert.rejects(setRoomCount(f.owner,{propertyId:bath,count:2}),/Одинаковые места/);
 }finally{f.db.close();}
});

test('a car wash sells its services: the box is held for the service\'s minutes at its price, with the car named',async()=>{
 const f=await fixture();try{
  const {SERVICE_STARTERS,servicesInput}=await load('venue-services');
  const wash=(await f.owner.saveListing(null,listing('carwash',{details:{...listing('carwash').details,services:SERVICE_STARTERS.carwash}}))).id;
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const start=at(10),ask=(service,minutes,car='Toyota Camry, 123 ABC 14')=>({propertyId:wash,start:iso(start),end:iso(start+minutes*60),guests:1,billingMode:'hourly',service,car});
  const quote=await f.guest.bookingQuote(ask('Кузов',30));
  assert.equal(quote.amount,3000);assert.equal(quote.service,'Кузов');assert.equal(quote.serviceLine,'Кузов · Toyota Camry, 123 ABC 14');
  // The service's own minutes: a wrong end is refused, an unknown service too, a phone in the car field too.
  await assert.rejects(f.guest.bookingQuote(ask('Кузов',60)),/занимает 30 мин/);
  await assert.rejects(f.guest.bookingQuote(ask('Полёт на Луну',30)),/Такой услуги здесь нет/);
  await assert.rejects(f.guest.bookingQuote(ask('Кузов',30,'Camry, звоните +7 701 123 45 67')),/без телефона/);
  // Without a service the hour price stays, as for an older app.
  assert.equal((await f.guest.bookingQuote({propertyId:wash,start:iso(start),end:iso(start+3600),guests:1,billingMode:'hourly'})).amount,5000);
  const made=await f.guest.createBooking({...ask('Комплекс',60),requestKey:'wash',acceptTerms:true,expectedAmount:6000});
  const row=f.db.raw.prepare('SELECT b.amount,t.service,t.min_hours FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=?').get(made.id);
  assert.equal(row.amount,6000);assert.equal(row.service,'Комплекс · Toyota Camry, 123 ABC 14');assert.equal(row.min_hours,1);
  // The car place is found by the hour: its least is one hour, whatever the owner's form said.
  assert.equal(f.db.raw.prepare('SELECT min_hours FROM property_policies WHERE property_id=?').get(wash).min_hours,1);
  // A service moves whole: the same minutes at its own price; another length is refused.
  f.db.raw.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(made.id);
  const moved=await f.guest.bookingChangeQuote(made.id,'guest',{start:iso(start+3600),end:iso(start+7200)});
  assert.equal(moved.amount,6000);
  await assert.rejects(f.guest.bookingChangeQuote(made.id,'guest',{start:iso(start+3600),end:iso(start+3*3600)}),/только перенести/);
  // The owner's list is checked; another kind keeps none.
  assert.throws(()=>servicesInput('carwash',[{name:'Кузов',minutes:20,price:3000}]),/шагом 15 минут/);
  assert.throws(()=>servicesInput('carwash',[{name:'Кузов',minutes:30,price:3000},{name:'кузов',minutes:45,price:4000}]),/уже есть/);
  assert.deepEqual(servicesInput('loft',[{name:'Кузов',minutes:30,price:3000}]),[]);
  const kept=JSON.parse(f.db.raw.prepare('SELECT details FROM property_details WHERE property_id=?').get(wash).details).services;
  assert.equal(kept.length,3);
 }finally{f.db.close();}
});

test('a crossover pays its own price, and the queue offers only the free starts of the day',async()=>{
 const f=await fixture();try{
  const {SERVICE_STARTERS,freeStarts,servicesInput}=await load('venue-services');
  const wash=(await f.owner.saveListing(null,listing('carwash',{details:{...listing('carwash').details,services:SERVICE_STARTERS.carwash}}))).id;
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const start=at(10),ask=(service,minutes,carClass)=>({propertyId:wash,start:iso(start),end:iso(start+minutes*60),guests:1,billingMode:'hourly',service,car:'Toyota RAV4',carClass});
  assert.equal((await f.guest.bookingQuote(ask('Комплекс',60))).amount,6000);
  const cross=await f.guest.bookingQuote(ask('Комплекс',60,'crossover'));
  assert.equal(cross.amount,7000);assert.equal(cross.serviceLine,'Комплекс · Кроссовер · Toyota RAV4');
  assert.equal((await f.guest.bookingQuote(ask('Комплекс',60,'suv'))).amount,8000);
  // A service without its own class price costs the car's price; an unknown class is a car.
  assert.equal((await f.guest.bookingQuote(ask('Мойка двигателя',30,'suv'))).amount,4000);
  assert.equal((await f.guest.bookingQuote(ask('Комплекс',60,'tank'))).amount,6000);
  assert.throws(()=>servicesInput('carwash',[{name:'Кузов',minutes:30,price:3000,prices:{suv:50}}]),/цена от 100/);
  // The queue: 09:00–21:00, every 15 minutes; a booked hour and its cleaning are skipped.
  const day=at(0),slots=async()=>(await f.guest.serviceSlots({propertyId:wash,service:'Комплекс',day})).starts;
  const before=await slots();
  assert.equal(before[0],at(9));assert.equal(before.at(-1),at(20));assert.ok(before.includes(at(10)));
  await f.guest.createBooking({...ask('Комплекс',60,'crossover'),requestKey:'q1',acceptTerms:true,expectedAmount:7000});
  const after=await slots();
  // 10:00–11:00 is booked and cleaned until 11:30; a 09:00 wash with its own cleaning would run into it too.
  assert.equal(after[0],at(11)+1800);assert.ok(!after.includes(at(9)));assert.equal(after.length,before.length-10);
  await assert.rejects(f.guest.serviceSlots({propertyId:wash,service:'Полёт',day}),/Такой услуги здесь нет/);
  // The pure rule: a start before the earliest moment or outside the hours is not offered.
  assert.deepEqual(freeStarts({day:0,minutes:30,busy:[[3600,7200]],earliest:1800,fits:(a,b)=>b<=3*3600}),[1800,7200,8100,9000]);
 }finally{f.db.close();}
});

test('the AI administrator search finds the kind that is asked for: a car wash, not homes',async()=>{
 const f=await fixture();try{
  const wash=(await f.owner.saveListing(null,listing('carwash'))).id,flat=(await f.owner.saveListing(null,listing('apartment'))).id;
  const tires=(await f.owner.saveListing(null,listing('tires'))).id;
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const {administratorSearch}=await load('administrator-search');
  const found=await administratorSearch(f.guest,'Хочу помыть машину в Павлодаре');
  assert.deepEqual(found.result.properties.map(p=>p.id),[wash]);
  assert.deepEqual(found.result.filters.kinds,['carwash']);
  assert.equal(found.result.filters.mode,'hourly');
  // Only the kind asked for: a tire shop of the same section is not a car wash.
  assert.ok(!found.result.properties.some(p=>p.id===tires));
  // «Завтра» with a budget is not a whole day priced by the hour.
  assert.deepEqual((await administratorSearch(f.guest,'Найди автомойку завтра до 10000')).result.properties.map(p=>p.id),[wash]);
  assert.match(found.text,/Автомойка/);assert.doesNotMatch(found.text,/гостей/);
  // «А подешевле?» after it keeps the car wash; a new ask for a home finds the home.
  assert.deepEqual((await administratorSearch(f.guest,'а подешевле?',found.result.filters)).result.properties.map(p=>p.id),[wash]);
  const homes=(await administratorSearch(f.guest,'Найди жильё в Павлодаре на сутки',found.result.filters)).result.properties.map(p=>p.id);assert.ok(homes.includes(flat)&&!homes.includes(wash));
 }finally{f.db.close();}
});
