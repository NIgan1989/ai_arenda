import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,now as epoch,iso,load} from './helpers/platform.mjs';
const {listingInput,kindCategory,searchCategory,maxGuests}=await load('listings');
const {rentalPrice,withGuests,policyInput}=await load('rental-policy');
const {cancellationTerms}=await load('cancellation');
const {guestSearchRequest,banquetStay,defaultBanquet,BANQUET_KINDS}=await load('map-search-request');
const {withBanquetPrice,banquetPrice,stepLine}=await load('listing-edit');
const {readListingText,emptyDraft,draftListingBody,draftQuestions}=await load('listing-draft');

const now=Date.parse('2026-11-17T10:00:00+05:00'); // a Tuesday
const base={city:'Павлодар',mode:'daily',start:'2026-11-17T14:00',end:'2026-11-18T12:00',guests:2,kinds:[]};

test('banquet is its own category with up to a thousand guests',()=>{
 assert.equal(kindCategory('banquet'),'banquet');assert.equal(kindCategory('cafe'),'banquet');
 assert.equal(searchCategory(['banquet','cafe']),'banquet');assert.equal(searchCategory(['banquet','banya']),'stay');assert.equal(searchCategory([]),'stay');
 assert.equal(maxGuests('banquet'),1000);assert.equal(maxGuests('banya'),50);
 const body={title:'Зал «Сарыарка»',city:'Павлодар',district:'Центр',address:'ул. Сатпаева, 1',description:'x'.repeat(90),price:400000,rooms:1,capacity:200,cleaningMinutes:60,photos:[],published:false,details:{type:'banquet',area:300,beds:1,bathrooms:2,floor:1,floors:2,checkinMethod:'meet',amenities:['halal','stage'],menu:' Бешбармак, баурсаки '}};
 const v=listingInput(body);assert.equal(v.p.capacity,200);assert.equal(v.details.beds,200);assert.equal(v.details.menu,'Бешбармак, баурсаки');assert.equal(v.p.ownStaff,1);
 assert.throws(()=>listingInput({...body,details:{...body.details,type:'apartment'}}),/Гости/);
 assert.equal(listingInput({...body,capacity:4,details:{...body.details,type:'apartment',beds:4,amenities:[]}}).details.menu,undefined);
});

test('the price is guests × price per guest, never under the least order',()=>{
 const b=withBanquetPrice({price:0,rental:{includedGuests:0,extraGuestPrice:0,hourlyPrice:5,nightlyPrice:5}},8000,50);
 assert.equal(b.price,400000);assert.deepEqual(banquetPrice(b),{perGuest:8000,least:50});assert.equal(b.rental.hourlyPrice,0);
 const policy={included_guests:b.rental.includedGuests,extra_guest_price:b.rental.extraGuestPrice};
 const slot=(guests)=>withGuests(rentalPrice(b.price,policy,1000,1000+5*3600,'daily'),policy,guests);
 assert.equal(slot(80).amount,640000);assert.equal(slot(50).amount,400000);assert.equal(slot(30).amount,400000);assert.equal(slot(80).periods,1);
 assert.equal(policyInput({hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'12:00',checkoutTime:'00:00',deposit:0,houseRules:'Правила',cleaningFee:0,cleaningBudget:0,includedGuests:300,extraGuestPrice:8000}).included_guests,300);
});

test('a cancelled banquet returns everything paid, at any hour',()=>{
 const v={by:'guest',status:'confirmed',mode:'daily',rate:640000,units:1,amount:640000,paid:200000,deposit:0,start:10000,minHours:1,at:9000};
 assert.equal(cancellationTerms(v).withheld,200000);
 const c=cancellationTerms({...v,banquet:true});assert.equal(c.free,true);assert.equal(c.refund,200000);assert.equal(c.withheld,0);
});

test('the text names a banquet by the hall or by what it is for',()=>{
 const toi=guestSearchRequest('той на 150 человек 5 декабря',base,['Павлодар'],now);
 assert.deepEqual(toi.filters.kinds,BANQUET_KINDS);assert.equal(toi.filters.occasion,'toi');assert.equal(toi.filters.guests,'150');assert.equal(toi.filters.mode,'daily');
 assert.equal(toi.filters.start,'2026-12-05T18:00');assert.equal(toi.filters.end,'2026-12-06T00:00');assert.equal(toi.understood,true);
 const ac=guestSearchRequest('поминки завтра на 60 человек, халяль',base,['Павлодар'],now);
 assert.equal(ac.filters.occasion,'memorial');assert.equal(ac.filters.start,'2026-11-18T12:00');assert.equal(ac.filters.end,'2026-11-18T17:00');assert.deepEqual(ac.filters.features,['halal']);
 const hall=guestSearchRequest('банкетный зал в субботу в обед',base,['Павлодар'],now);
 assert.equal(hall.filters.start,'2026-11-21T12:00');assert.equal(hall.filters.occasion,undefined);
 // «В той квартире» is not a той, and a flat is still a flat.
 assert.equal(guestSearchRequest('в той же квартире завтра',base,['Павлодар'],now).filters.kinds.length,0);
 assert.equal(guestSearchRequest('квартира на двоих',base,['Павлодар'],now).filters.guests,'2');
 // More than fifty guests only in a banquet.
 assert.equal(guestSearchRequest('дом на 80 человек',base,['Павлодар'],now).filters.guests,'50');
 // In the category, a bare phrase keeps the day and changes the slot.
 const kept={...base,kinds:BANQUET_KINDS,...banquetStay('2026-12-05','evening'),guests:100};
 const lunch=guestSearchRequest('а в обед',kept,['Павлодар'],now);assert.equal(lunch.filters.start,'2026-12-05T12:00');
 assert.deepEqual(defaultBanquet(now),{mode:'daily',start:'2026-11-21T18:00',end:'2026-11-22T00:00'});
 assert.equal(defaultBanquet(now,'memorial').start,'2026-11-18T12:00');
});

test('the owner describes a hall in one message',()=>{
 const {draft}=readListingText('Банкетный зал в центре, до 200 гостей, от 50 человек, 8000 с человека, ул. Сатпаева 10',emptyDraft('Павлодар'));
 assert.equal(draft.type,'banquet');assert.equal(draft.capacity,200);assert.equal(draft.leastGuests,50);assert.equal(draft.price,8000);assert.equal(draft.ownStaff,true);
 const body=draftListingBody(draft,[],false);assert.equal(body.price,400000);assert.equal(body.rental.includedGuests,50);assert.equal(body.rental.extraGuestPrice,8000);
 assert.equal(listingInput(body).p.capacity,200);
 assert.equal(draftQuestions({...draft,price:0}).at(-1).label,'Цена на гостя');
 assert.match(stepLine({...body,details:body.details,rental:{...body.rental}},'prices'),/8\s000 ₸ за гостя · от 50 гост\. · меню нет/);
});

// The whole way: the owner lists a hall, a guest books a slot for a memorial meal, the owner reads what it is for,
// and a late cancellation returns everything paid.
const hall=()=>({title:'Зал «Сарыарка»',city:'Павлодар',district:'Центр',address:'PRIVATE HALL ADDRESS',description:'Банкетный зал на двести гостей со сценой, звуком и своей кухней. Халяль, отдельная комната для намаза.',price:400000,rooms:1,capacity:200,cleaningMinutes:60,ownStaff:true,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type:'banquet',area:300,beds:1,bathrooms:2,floor:1,floors:2,checkinMethod:'meet',amenities:['halal','prayer'],pets:false,smoking:false,parties:true,menu:'Бешбармак, баурсаки, чай'},
 rental:{hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'12:00',checkoutTime:'00:00',deposit:0,houseRules:'Число гостей уточняется за три дня.',includedGuests:50,extraGuestPrice:8000}});
test('a guest books a slot of a banquet hall for a memorial meal',async()=>{
 const f=await fixture();try{
  const id=(await f.owner.saveListing(null,hall())).id;f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(id);
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);
  const day=Math.floor((epoch()+3*86400)/86400)*86400,start=day+7*3600,end=day+12*3600; // 12:00–17:00 in Kazakhstan
  const found=await f.guest.publicSearch({city:'Павлодар',mode:'daily',guests:'80',kinds:['banquet','cafe'],start:iso(start),end:iso(end)});
  assert.deepEqual(found.properties.map(p=>[p.id,p.estimate.amount,p.details.menu]),[[id,640000,'Бешбармак, баурсаки, чай']]);
  // A hall never shows among homes, and a home never among halls.
  assert.ok(!(await f.guest.publicSearch({city:'Павлодар',mode:'daily',guests:'2',start:iso(start),end:iso(end)})).properties.some(p=>p.id===id));
  await assert.rejects(f.guest.bookingQuote({propertyId:id,start:iso(start),end:iso(start+2*86400),guests:80,billingMode:'daily'}),/на обед или на вечер/);
  await assert.rejects(f.guest.bookingQuote({propertyId:id,start:iso(start),end:iso(end),guests:201,billingMode:'daily'}),/Гости/);
  const quote=await f.guest.bookingQuote({propertyId:id,start:iso(start),end:iso(end),guests:80,billingMode:'daily'});
  assert.deepEqual([quote.amount,quote.periods,quote.price,quote.kind],[640000,1,640000,'banquet']);
  const made=await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(end),guests:80,billingMode:'daily',occasion:'memorial',requestKey:'banquet-1',acceptTerms:true,expectedAmount:640000});
  assert.equal(f.db.raw.prepare('SELECT occasion FROM booking_terms WHERE booking_id=?').get(made.id).occasion,'memorial');
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE body LIKE '%Поминки, ас, гостей: 80%'").get());
  // The evening of the same day stays free for another party: the hall is ready an hour after lunch.
  assert.equal((await f.guest.publicSearch({city:'Павлодар',mode:'daily',guests:'60',kinds:['banquet','cafe'],start:iso(day+13*3600),end:iso(day+19*3600)})).properties.length,1);
  await f.owner.bookingAction(made.id,{action:'confirm',cleaningFee:0});
  f.db.raw.prepare('UPDATE booking_terms SET paid_amount=200000 WHERE booking_id=?').run(made.id);
  f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(epoch()+3600,made.id);
  const state=await f.guest.roleState('guest',{catalog:false}),mine=state.bookings.find(b=>b.id===made.id);
  assert.deepEqual([mine.cancel_terms.free,mine.cancel_terms.refund,mine.terms.occasion],[true,200000,'memorial']);
 }finally{f.db.close();}
});
