import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {administratorConversation}=await load('administrator-conversation');
const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'};

test('follow-up search retains this guest city and constraints, rechecks tomorrow, and never inherits another account',async()=>{
 const f=await fixture();try{
  await f.owner.createProperty({title:'Astana apartment',city:'Астана',district:'Центр',address:'PRIVATE',description:'Test',price:12000,rooms:1,capacity:2,cleaningMinutes:90});
  await f.guest.chat({role:'guest',text:'Найди жильё в Астане до 15000'});
  const cheaper=await f.guest.chat({role:'guest',text:'Теперь дешевле',searchFilters:{city:'Павлодар'}});assert.equal(cheaper.search.filters.city,'Астана');assert.equal(cheaper.search.filters.maxPrice,'15000');assert.equal(cheaper.search.filters.sort,'price-asc');assert.match(cheaper.text,/до 15000/);
  const tomorrow=await f.guest.chat({role:'guest',text:'А на завтра?'});assert.equal(tomorrow.search.filters.city,'Астана');assert.equal(tomorrow.search.availabilityChecked,true);assert.equal(tomorrow.search.total,1);
  const longer=await f.guest.chat({role:'guest',text:'На 2 суток'});assert.equal(longer.search.total,0);assert.equal(longer.search.filters.maxPrice,'15000');
  await f.other.connectRole('guest',{});const other=await f.other.chat({role:'guest',text:'Теперь дешевле'});assert.equal(other.search,undefined);
  const reset=await f.guest.chat({role:'guest',text:'Найди однокомнатную квартиру в Павлодаре'});assert.equal(reset.search.filters.city,'Павлодар');assert.equal(reset.search.filters.maxPrice,undefined);
 }finally{f.db.close();}
});

test('one-room requests exclude two-room offers while minimum requests keep them',async()=>{
 const f=await fixture();try{
  await f.owner.createProperty({title:'Two rooms',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Test',price:10000,rooms:2,capacity:2,cleaningMinutes:90});
  const exact=await f.guest.chat({role:'guest',text:'Найди однокомнатную квартиру'});assert.equal(exact.search.total,1);assert.equal(exact.search.properties[0].id,f.property);
  const minimum=await f.guest.chat({role:'guest',text:'Найди жильё от 1 комнаты'});assert.equal(minimum.search.total,2);
 }finally{f.db.close();}
});

test('synthetic preview follows server isolation and never bypasses booking admission',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE properties SET description='СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ · проверка' WHERE id=?").run(f.property);
  f.db.raw.prepare('UPDATE pilot_policy SET require_owner_review=1,require_phone=1').run();
  assert.equal((await f.guest.chat({role:'guest',text:'Найди жильё',syntheticPreview:true})).search.total,0);
  const r=await f.guest.chat({role:'guest',text:'Найди жильё'},{TEST_DATA_ONLY:'1'});assert.equal(r.search.total,1);assert.equal(r.search.properties[0].testPreview,true);assert.match(r.text,/не подтверждает допуск/);
  await assert.rejects(f.guest.createBooking({propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),guests:1,billingMode:'hourly',acceptTerms:true,requestKey:'preview'}),e=>e.status===409);
 }finally{f.db.close();}
});

test('administrator searches the live catalog beyond 15 rows without sending text or private data externally',async()=>{
 const f=await fixture(),original=globalThis.fetch;let called=0;globalThis.fetch=async()=>{called++;throw Error('Must be local');};
 try{
  const target=(await f.owner.createProperty({title:'Beyond snapshot',city:'Павлодар',district:'Центр',address:'NEVER EXPOSE THIS',description:'Test',price:2000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  for(let i=0;i<17;i++)await f.owner.createProperty({title:'Other '+i,city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Test',price:20000,rooms:1,capacity:2,cleaningMinutes:90});
  const r=await f.guest.chat({role:'guest',text:'Найди жильё в Павлодаре до 3000 тенге'},config);
  assert.equal(called,0);assert.equal(r.mode,'scenario');assert.equal(r.search.total,1);assert.equal(r.search.properties[0].id,target);assert.equal(r.search.availabilityChecked,false);assert.match(r.text,/без проверки дат/);assert.doesNotMatch(JSON.stringify(r),/NEVER EXPOSE|PRIVATE/);
  const history=await administratorConversation(f.guest,'guest');assert.equal(history.messages.at(-1).search.total,1);assert.equal((await administratorConversation(f.owner,'owner')).messages.length,0);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,0);
 }finally{globalThis.fetch=original;f.db.close();}
});

test('live search checks occupancy, prices and timezone and never creates a booking or claims nearby GPS',async()=>{
 const f=await fixture();try{
  const start=now()+5*86400,end=start+86400,filters={city:'Павлодар',start:iso(start),end:iso(end),guests:'1'};
  const before=f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n;
  let r=await f.guest.chat({role:'guest',text:'Найди свободную квартиру рядом со мной',searchFilters:filters});
  assert.equal(r.search.availabilityChecked,true);assert.equal(r.search.total,1);assert.equal(r.search.properties[0].amount,10000);assert.match(r.text,/Геопозиция не запрашивалась/);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,before);
  await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'daily',acceptTerms:true,requestKey:'occupy'});
  r=await f.guest.chat({role:'guest',text:'Найди свободную квартиру',searchFilters:filters});assert.equal(r.search.total,0);
  const day=new Date((now()+9*86400)*1000).toISOString().slice(0,10),next=new Date((now()+10*86400)*1000).toISOString().slice(0,10);
  r=await f.guest.chat({role:'guest',text:`Найди жильё с ${day} по ${next}`});assert.equal(r.search.filters.start,day+'T14:00');assert.equal(r.search.availabilityChecked,true);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,before+1);
 }finally{f.db.close();}
});

test('a request for a flat is a search with or without a search verb, a question about how things work is not',async()=>{
 const {isPropertySearch}=await load('administrator-search');
 for(const text of ['Найди жильё в Астане до 15000','Как найти квартиру на завтра?','квартира в Астане на сутки завтра на троих','Хочу снять жильё','Нужна студия на выходные','жильё на 3 часа сегодня'])assert.equal(isPropertySearch(text),true,text);
 for(const text of ['Как снять жильё?','Что нужно, чтобы снять жильё?','Можно ли снять жильё с собакой?','Сколько стоит снять жильё?','Покажи мои квартиры','Когда заезд в квартиру сегодня?','Отмени бронь квартиры на завтра','Привет'])assert.equal(isPropertySearch(text),false,text);
});
