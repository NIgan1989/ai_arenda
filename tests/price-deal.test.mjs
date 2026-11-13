import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {dealFor,markDeals,dealBadge,dealNote,DEAL_PERCENT}=await load('price-deal');
const flat=(id,amount,rooms=1,over={})=>({id,rooms,estimate:{amount},...over});
const money=n=>n+' ₸';

test('a flat is a good price when it is clearly below similar free flats for the same dates',()=>{
 const all=[flat('a',8000),flat('b',10000),flat('c',10500),flat('d',11000,2),flat('e',30000,4)];
 const deal=dealFor(all[0],all);
 assert.deepEqual(deal,{percent:24,typical:10500,similar:3},'four-room flat is not similar to a one-room flat');
 assert.equal(dealBadge(deal),'Цена выгодная · −24%');
 assert.equal(dealNote(deal,money),'Похожие свободные квартиры на эти даты стоят около 10500 ₸');
 assert.equal(dealFor(all[1],all),null,'a few percent below is not a deal');
 assert.equal(dealFor(flat('x',8000),[flat('x',8000),flat('b',10000),flat('c',10500)]),null,'two similar flats are too few');
 assert.equal(dealFor(flat('t',5000),[flat('t',5000),flat('b',10000),flat('c',10000),flat('p',4000,1,{test_preview:true})])?.similar,undefined,'a test preview is never a comparison');
 assert.ok(DEAL_PERCENT>=10);
 const marked=markDeals(all);assert.equal(marked[0].estimate.deal.percent,24);assert.equal(marked[1].estimate.deal,undefined);assert.equal(marked[0].estimate.amount,8000);
 assert.equal(dealBadge(null),'');
});

test('the catalog for given dates marks the cheaper flat and keeps the mark after a budget cut',async()=>{
 const f=await fixture();try{
  const make=async(n,price)=>{const id=(await f.other.createProperty({title:'Similar '+n,city:'Павлодар',district:'Центр',address:'S'+n,description:'Test',price,rooms:1,capacity:2,cleaningMinutes:60})).id;await f.other.savePolicy(id,{...f.policy,dailyPrice:price,expectedVersion:0});return id;};
  for(const [n,p] of [[1,14000],[2,15000],[3,16000]])await make(n,p);
  f.db.raw.prepare('UPDATE properties SET published=1').run();
  const start=iso(now()+2*86400),end=iso(now()+3*86400);
  const all=await f.guest.publicSearch({city:'Павлодар',start,end,guests:'2',mode:'daily'});
  const mine=all.properties.find(p=>p.id===f.property);
  assert.ok(mine.estimate.deal,'the fixture flat is cheaper than the three similar ones');
  assert.ok(all.properties.filter(p=>p.id!==f.property).every(p=>!p.estimate.deal));
  const cut=await f.guest.publicSearch({city:'Павлодар',start,end,guests:'2',mode:'daily',maxPrice:'12000'});
  assert.deepEqual(cut.properties.map(p=>p.id),[f.property]);assert.ok(cut.properties[0].estimate.deal,'compared before the budget filter');
  assert.equal((await f.guest.publicSearch({city:'Павлодар',guests:'2',mode:'daily'})).properties.some(p=>p.estimate?.deal),false,'no dates, no comparison');
 }finally{f.db.close();}
});
