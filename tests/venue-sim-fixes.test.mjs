import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {placeWords,ownerPrice}=await load('place-words'),{propertyStatus}=await load('listings'),{prepayLabel}=await load('prepay'),{readListingText,emptyDraft,draftListingBody}=await load('listing-draft');

// Found by the simulation of the 16 kinds of «Досуг», «Спорт», «Авто» (2026-11-28).
test('the owner sees the price a guest pays, not the hidden day price of an hourly place',()=>{
 const wash={price:60000,details:{type:'carwash',services:[{name:'Кузов',minutes:30,price:3000},{name:'Комплекс',minutes:60,price:6000}]},policy:{hourly_price:5000}};
 assert.equal(ownerPrice(wash).amount,3000);assert.match(ownerPrice(wash).line,/^от 3.000 ₸$/);
 const loft={price:96000,details:{type:'loft'},policy:{hourly_price:8000}};
 assert.equal(ownerPrice(loft).amount,8000);assert.match(ownerPrice(loft).line,/8.000 ₸ \/ час/);
 assert.equal(ownerPrice({price:15000,details:{type:'apartment'},policy:{}}).amount,15000);
});

test('a place that is not housing reads its own status words, payment and greeting',()=>{
 const op={readiness:'ready'};
 assert.equal(propertyStatus({published:1},op,false,'carwash').label,'Готово к приёму машин');
 assert.equal(propertyStatus({published:1},op,false,'loft').label,'Готово к приходу гостей');
 assert.equal(propertyStatus({published:1},op,false,'apartment').label,'Готово к заселению');
 assert.equal(propertyStatus({published:1},{active_booking_id:'b'},false,'carwash').label,'Бокс занят');
 assert.equal(prepayLabel(0,true),'Оплата на месте');assert.equal(prepayLabel(0),'Оплата при заселении');
 const w=placeWords({price:60000,capacity:1,details:{type:'carwash',area:35,checkinMethod:'meet'},policy:{hourly_price:5000,min_hours:1}});
 assert.doesNotMatch(w.kind,/м²/);
 assert.ok(w.terms.includes('Встречает администратор'),w.terms.join('|'));
});

test('a court, a billiard table and a quest get their usual company and an hour minimum',()=>{
 const court=readListingText('Теннисный корт на Торайгырова 10, 6 000 в час',emptyDraft('Павлодар')).draft;
 assert.equal(court.type,'court');assert.equal(court.capacity,4);assert.equal(court.minHours,1);
 const kids=readListingText('Детская комната на Ломова 5, до 15 детей, 7 000 в час',emptyDraft('Павлодар')).draft;
 assert.equal(kids.capacity,15);
 const wash=draftListingBody({...readListingText('Автомойка на Ломова 5, свои мойщики',emptyDraft('Павлодар')).draft,ownStaff:true,address:'Ломова 5',district:'Центр'},[],false);
 assert.equal(wash.cleaningMinutes,0);
});

test('the editor keeps a zero break of a car bay',async()=>{
 const {editBody}=await load('listing-edit');
 assert.equal(editBody({cleaning_minutes:0,details:{type:'carwash'},policy:{}}).cleaningMinutes,0);
 assert.equal(editBody({details:{type:'apartment'},policy:{}}).cleaningMinutes,90);
});

test('a finished visit to a loft with its own staff keeps its break, a finished stay in a home does not',async()=>{
 const {fixture,now,iso}=await import('./helpers/platform.mjs');
 const f=await fixture();try{
  const body=type=>({title:'Место для проверки',city:'Павлодар',district:'Центр',address:'PRIVATE PLACE ADDRESS',description:'Просторное место на час для компании, есть всё нужное, приходите вовремя и уходите вовремя, спасибо.',price:60000,rooms:1,capacity:6,cleaningMinutes:30,ownStaff:type==='loft',photos:[],published:false,expectedVersion:0,policyVersion:0,
   details:{type,area:80,beds:type==='apartment'?4:6,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:[],pets:false,smoking:false,parties:false},
   rental:{hourlyPrice:5000,minHours:1,nightlyPrice:0,checkinTime:'00:00',checkoutTime:'00:00',deposit:0,houseRules:'Приходите вовремя.',includedGuests:0,extraGuestPrice:0}});
  const loft=(await f.owner.saveListing(null,body('loft'))).id;
  f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const day=Math.floor((now()+5*3600)/86400)*86400+86400-5*3600,start=day+12*3600;
  // Finished at 12:00 tomorrow (a test clock trick: the break runs to 12:30, and now() is before it).
  f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES ('done1',?,'other',?,?,?,1,5000,'completed',0,'owner_verified','k-done1',?)").run(loft,start-3600,start,start+1800,now());
  await assert.rejects(f.guest.bookingQuote({propertyId:loft,start:iso(start),end:iso(start+3600),guests:1,billingMode:'hourly'}),/занят|недоступ|время/i);
  f.db.raw.prepare('UPDATE properties SET own_staff=0 WHERE id=?').run(loft);
  assert.equal((await f.guest.bookingQuote({propertyId:loft,start:iso(start),end:iso(start+3600),guests:1,billingMode:'hourly'})).amount,5000);
 }finally{f.db.close();}
});
