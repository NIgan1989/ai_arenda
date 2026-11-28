import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';

// «Формы под каждый тип» (2026-11-28): the kind comes first, its form fills what the kind adds, and the cards it
// saves are what the server takes.
const {formKind,startExtras,missingFields,formPlan}=await load('listing-forms');
const {emptyDraft,readListingText}=await load('listing-draft');
const draft=(text)=>readListingText(text,emptyDraft('Павлодар')).draft;

test('every kind has its own form',()=>{
 assert.deepEqual(['apartment','house','hotel','hostel','resort','banya','sauna','banquet','cafe','loft','field','billiard','carwash','tires'].map(formKind),
  ['stay','stay','rooms','rooms','rooms','bath','bath','hall','hall','hourly','hourly','hourly','auto','auto']);
});

test('the form asks what its kind needs and nothing of other kinds',()=>{
 const flat={...emptyDraft('Павлодар'),type:'apartment',ownStaff:true};
 assert.deepEqual(missingFields(flat,startExtras(flat)).map(m=>m.label),['Цена за сутки','Адрес','Район']);
 const wash={...flat,type:'carwash',address:'Ломова 1',district:'Центр'},x=startExtras(wash);
 assert.ok(x.services.length>0,'a car wash starts with the usual services');
 assert.deepEqual(missingFields(wash,x),[]);
 assert.deepEqual(missingFields(wash,{...x,services:[]}).map(m=>m.label),['Услуги и цены']);
 const hotel={...flat,type:'hotel',address:'Ломова 1',district:'Центр'};
 assert.deepEqual(missingFields(hotel,startExtras(hotel)).map(m=>m.label),['Цена номера']);
 const bath={...flat,type:'banya',ownStaff:false,hourlyPrice:5000,address:'Лесная 5',district:'Дачный'};
 assert.deepEqual(missingFields(bath,startExtras(bath)).map(m=>m.label),['Цена уборки']);
 // The same kind keeps what was filled; another kind starts its own form.
 const filled={...startExtras(bath),units:4};
 assert.equal(startExtras(bath,filled).units,4);
 assert.equal(startExtras({...bath,type:'carwash'},filled).units,1);
});

test('a hotel saves one card per room type with its count, a car wash its boxes, services and hours',async()=>{
 const f=await fixture(),{setRoomCount}=await load('room-units');
 const hotel={...draft('Гостиница «Ертіс» на Ломова 1, район Центр, стойка регистрации'),ownStaff:true};
 const x={...startExtras(hotel),roomTypes:[{name:'Стандарт',count:3,capacity:2,price:12000},{name:'Люкс',count:1,capacity:2,price:25000}]};
 const plan=formPlan(hotel,x,[],false);
 assert.equal(plan.cards.length,2);
 assert.deepEqual(plan.cards.map(c=>c.units),[3,1]);
 const ids=[];for(const c of plan.cards){const id=(await f.owner.saveListing(null,c.body)).id;ids.push(id);if(c.units>1)await setRoomCount(f.owner,{propertyId:id,count:c.units});}
 const cards=ids.map(id=>f.db.raw.prepare('SELECT title,price,capacity FROM properties WHERE id=?').get(id));
 assert.deepEqual(cards.map(c=>[c.price,c.capacity]),[[12000,2],[25000,2]]);
 assert.match(cards[1].title,/Люкс/);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM room_units WHERE lead_id=?').get(ids[0]).n,2);

 const wash={...draft('Автомойка на Торайгырова 10, район Центр'),ownStaff:true};
 const w={...startExtras(wash),units:4,bookedBays:1,hours:{open:'08:00',close:'22:00',sessions:[]}};
 const [card]=formPlan(wash,w,[],false).cards;
 assert.equal(card.units,4);
 const id=(await f.owner.saveListing(null,card.body)).id;
 const details=JSON.parse(f.db.raw.prepare('SELECT details FROM property_details WHERE property_id=?').get(id).details);
 assert.equal(details.bookedBays,1);
 assert.ok(details.services.length>0);
 const hours=JSON.parse(f.db.raw.prepare('SELECT venue_hours FROM property_policies WHERE property_id=?').get(id).venue_hours);
 assert.deepEqual([hours.open,hours.close],[480,1320]);
});

test('a banquet hall saves its menu and its further halls with their own capacity',async()=>{
 const hall={...draft('Банкетный зал «Мерей» на Кутузова 5, район Центр, 8 000 на гостя'),ownStaff:true};
 const x={...startExtras(hall),halls:[{name:'Большой зал',capacity:300},{name:'Малый зал',capacity:60}],menu:'Бешбармак'};
 const plan=formPlan(hall,x,[],false);
 assert.equal(plan.cards[0].body.capacity,300);
 assert.equal(plan.cards[0].body.details.menu,'Бешбармак');
 assert.deepEqual(plan.halls.map(h=>[h.name,h.body.capacity]),[['Малый зал',60]]);
 assert.match(plan.venueTitle,/Мерей/);
 assert.ok(plan.cards[0].body.rental.venueHours.sessions.length>0,'a hall sends its event times');
 // As the app saves them: the first hall, then each further one copied from it (lib/venue.ts) and given its capacity.
 const f=await fixture(),{addHall,venueOf}=await load('venue');
 const first=(await f.owner.saveListing(null,plan.cards[0].body)).id;
 const r=await addHall(f.owner,{propertyId:first,title:plan.halls[0].name,venueTitle:plan.venueTitle});
 await f.owner.saveListing(r.id,{...plan.halls[0].body,title:plan.halls[0].name,expectedVersion:1,policyVersion:1});
 const venue=await venueOf(f.db,first);
 assert.equal(venue.title,plan.venueTitle);
 assert.deepEqual(venue.halls.map(h=>[h.title,h.capacity]).sort(),[[plan.cards[0].body.title,300],['Малый зал',60]].sort());
});

test('the story tells how many alike',async()=>{
 const {unitsFromText}=await load('listing-forms');
 assert.equal(unitsFromText('Автомойка, 4 бокса, с 9 до 21','carwash'),4);
 assert.equal(unitsFromText('Гостиница, 12 номеров','hotel'),12);
 assert.equal(unitsFromText('Мини-футбол, 2 поля','field'),2);
 assert.equal(unitsFromText('Квартира, 2 комнаты','apartment'),0);
 assert.equal(startExtras({...emptyDraft('Павлодар'),type:'carwash'},null,'4 бокса').units,4);
});
