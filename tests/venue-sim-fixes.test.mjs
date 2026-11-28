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
