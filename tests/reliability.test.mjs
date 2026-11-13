import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {guestReliability,cleanerReliability,ownerReliability,reliabilityFor}=await load('reliability');
const {reliabilityScore}=await load('reliability-text');
const DAY=86400,iso=t=>new Date(t*1000).toISOString();

test('the score rewards kept promises, weighs failures and shows a newcomer as new',()=>{
 assert.deepEqual(reliabilityScore(0,0,[]),{score:null,level:'new',label:'Новый участник',facts:[]});
 const steady=guestReliability({completed:6,disputes:0,cancels:0,phone:true});
 assert.equal(steady.score,4.8);assert.equal(steady.level,'excellent');assert.deepEqual(steady.facts,['6 проживаний','телефон подтверждён']);
 const disputed=guestReliability({completed:3,disputes:1,cancels:1,phone:false});
 assert.equal(disputed.level,'attention');assert.deepEqual(disputed.facts,['3 проживания','споров при выезде: 1','отмен после подтверждения: 1']);
 const cleaner=cleanerReliability({completed:12,noShows:0,returned:0});
 assert.equal(cleaner.level,'excellent');assert.deepEqual(cleaner.facts,['12 уборок','без срывов']);
 assert.ok(cleanerReliability({completed:12,noShows:2,returned:0}).score<cleaner.score,'a no-show costs');
 const owner=ownerReliability({answered:9,unanswered:1,completed:5,cancels:0,rating:4.8});
 assert.deepEqual(owner.facts,['отвечает на 90% заявок','5 завершённых броней','оценка гостей 4,8']);
 assert.equal(owner.level,'excellent');
});

test('the owner sees the guest, the cleaner and every guest sees the owner reliability',async()=>{
 const f=await fixture();try{
  // The fixture booking was confirmed by the owner: one answered request.
  const host=(await reliabilityFor(f.db,'owner',['owner'])).get('owner');
  assert.equal(host.facts[0],'отвечает на 100% заявок');
  const catalog=await f.guest.publicCatalog();
  assert.equal(catalog.properties[0].host.label,host.label);assert.equal(catalog.properties[0].owner_id,undefined,'the owner id stays private');
  const start=now()+2*DAY,id=(await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+DAY),guests:1,billingMode:'daily',requestKey:'rel',acceptTerms:true})).id;
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.id==='booking:'+id);
  assert.equal(card.reliability.level,'new');
  assert.equal((await f.guest.roleState('guest')).approvals.find(c=>c.id==='booking:'+id).reliability,undefined);
  const account=await f.guest.accountState('guest');assert.equal(account.reliability.level,'new');
  assert.equal((await f.owner.accountState('owner')).reliability.facts[0],'отвечает на 100% заявок');
  const worker=await f.owner.workerCard('cleaner');assert.equal(worker.reliability.level,'new');
 }finally{f.db.close();}
});
