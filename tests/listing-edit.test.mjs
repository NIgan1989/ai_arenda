import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {editBody,editRequest,nextAdvice,stepLine,stepNeeds,EDIT_STEPS}=await load('listing-edit');
const {listingInput}=await load('listings');
const flat={id:'p1',title:'Студия у парка',city:'Павлодар',district:'Центр',address:'Ленина 5, кв 3',description:'Светлая студия у парка: двуспальная кровать, кухня, стиральная машина и быстрый Wi-Fi. Рядом остановка и магазины.',price:15000,rooms:1,capacity:2,cleaning_minutes:90,published:0,photos:[],listing_version:4,
 details:{type:'studio',area:30,beds:2,bathrooms:1,floor:3,floors:9,checkinMethod:'lockbox',amenities:['wifi','kitchen','bogus'],pets:false,smoking:false,parties:false},
 policy:{version:2,hourly_price:0,min_hours:2,nightly_price:0,deposit:0,checkin_minutes:840,checkout_minutes:720,house_rules:''}};

test('an edited flat goes back to the server as a whole listing with the versions it started from',()=>{
 const b=editBody(flat),r=editRequest({...b,photos:['m1']},flat);
 assert.deepEqual(b.details.amenities,['wifi','kitchen']);assert.equal(b.rental.checkinTime,'14:00');
 assert.equal(r.expectedVersion,4);assert.equal(r.policyVersion,2);
 const parsed=listingInput({...r,published:true});assert.equal(parsed.published,1);assert.deepEqual(parsed.photos,['m1']);assert.equal(parsed.details.type,'studio');
});

test('the AI first asks for what keeps the flat hidden, then offers to show it, then what gets it booked more',()=>{
 const b=editBody(flat);
 assert.equal(nextAdvice(b).step,'photos');
 assert.equal(nextAdvice(b,['photos']).step,'amenities');
 const short={...b,photos:['m1'],description:'Коротко'};assert.equal(nextAdvice(short).step,'text');
 const ready={...b,photos:['m1','m2']};assert.equal(nextAdvice(ready).step,'publish');
 const shown={...ready,published:true};const a=nextAdvice(shown);assert.equal(a.step,'photos');assert.match(a.text,/ещё 3 фото/);
 assert.equal(nextAdvice(shown,['photos']).step,'amenities');
 const done={...shown,photos:['1','2','3','4','5'],details:{...shown.details,amenities:['wifi','kitchen','washer']},rental:{...shown.rental,hourlyPrice:2500,houseRules:'Тишина после 23:00.'}};
 assert.equal(nextAdvice(done).step,null);
});

test('each step has a one-line summary and a mark when something is missing',()=>{
 const b=editBody(flat);
 for(const s of EDIT_STEPS)assert.ok(stepLine(b,s.key).length>0);
 assert.equal(stepLine(b,'photos'),'Нет фото');assert.equal(stepLine(b,'flat'),'1 комн. · 30 м² · 2 гост.');
 assert.ok(stepNeeds(b,'photos'));assert.ok(stepNeeds(b,'rules'));assert.ok(!stepNeeds(b,'prices'));
});
