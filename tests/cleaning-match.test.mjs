import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {cleanerScore,rankCleaners}=await load('cleaner-match');
const {saveOperationRules,saveWorkerDispatch,coordinateDispatch}=await load('dispatch');
const {adviseCleaningFee,offerCleaningPriceTip,FEE_PAUSE}=await load('cleaning-price');
const {feeTipText}=await load('cleaning-tip-text');
const DAY=86400;
const stats=(id,over={})=>({id,completed:0,here:0,noShows:0,accepted:0,refused:0,...over});

test('the cleaner who comes and knows the flat goes first; missed cleanings weigh against volume',()=>{
 const ranked=rankCleaners([stats('busy',{completed:25,noShows:4,accepted:10,refused:10}),stats('known',{completed:8,here:3,accepted:8,refused:1}),stats('new')]);
 assert.deepEqual(ranked.map(c=>c.id),['known','busy','new']);
 assert.deepEqual(ranked[0].reasons,['знает это жильё: 3 уборки','8 уборок без срывов','принимает 89% предложений']);
 assert.deepEqual(cleanerScore(stats('busy',{completed:25,noShows:4})).reasons,['25 уборок, 4 срыва']);
 assert.deepEqual(cleanerScore(stats('new')).reasons,['новый исполнитель']);
 assert.ok(cleanerScore(stats('a',{completed:10})).score>cleanerScore(stats('b',{completed:10,noShows:3})).score);
});

test('dispatch offers the cleaning to the best cleaner and tells the owner why',async()=>{
 const f=await fixture();try{
  const {RentalService}=await load('service');const second=new RentalService(f.db,'cleaner2');
  await second.saveProfile({name:'Second',roles:['cleaner'],city:'Павлодар',contact:'test',districts:'Центр',experience:'Experienced',availability:'By agreement'});
  // The second cleaner has cleaned this flat twice before; the first has not cleaned anything.
  for(const k of [1,2])f.db.raw.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,start,end,fee,description,status,assigned_to,created_at) VALUES (?,?,'owner',?,?,3000,'Old','completed','cleaner2',?)").run('old'+k,f.property,now()-k*10*DAY,now()-k*10*DAY+3600,now()-k*10*DAY);
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,offerMinutes:10,expectedVersion:0});
  await saveWorkerDispatch(f.cleaner,{receiveOffers:true});await saveWorkerDispatch(second,{receiveOffers:true});
  assert.equal((await coordinateDispatch(f.owner)).offered,1);
  const offer=f.db.raw.prepare('SELECT * FROM cleaning_offers').get();assert.equal(offer.worker_id,'cleaner2');
  const note=f.db.raw.prepare('SELECT body FROM notifications WHERE dedupe=?').get('owner:offer:'+offer.id).body;
  assert.match(note,/исполнителю Second: знает это жильё: 2 уборки, 2 уборки без срывов\./);
 }finally{f.db.close();}
});

test('the cleaning price: refused again and again, or well below similar flats in the city',()=>{
 assert.deepEqual(adviseCleaningFee({fee:3000,typical:0,samples:0,refused:2,accepted:0}),{to:4000,reason:'refused'});
 assert.deepEqual(adviseCleaningFee({fee:3000,typical:5000,samples:4,refused:3,accepted:0}),{to:5000,reason:'refused'});
 assert.equal(adviseCleaningFee({fee:3000,typical:0,samples:0,refused:3,accepted:1}),null,'someone took it at this price');
 assert.deepEqual(adviseCleaningFee({fee:3000,typical:4500,samples:3,refused:0,accepted:0}),{to:4500,reason:'below'});
 assert.equal(adviseCleaningFee({fee:4000,typical:4500,samples:5,refused:0,accepted:0}),null,'close enough');
 assert.equal(adviseCleaningFee({fee:3000,typical:9000,samples:2,refused:0,accepted:0}),null,'two cleanings are too few to compare');
 assert.equal(adviseCleaningFee({fee:2000,typical:9000,samples:5,refused:0,accepted:0}).to,4000,'never more than double in one step');
 assert.equal(feeTipText({from_fee:3000,to_fee:4500,typical:4500,refused:2}).replace(/\s/g,' '),'Исполнители 2 раза не взяли уборку за 3 000 ₸. За похожие объекты в городе платят около 4 500 ₸. Предлагаю 4 500 ₸ за уборку.');
});

test('«Поставить» raises the cleaning price and offers open cleanings again at it; «Оставить» pauses it',async()=>{
 const f=await fixture();try{
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,offerMinutes:10,expectedVersion:0});
  // Two cleaners let the offer at 3 000 ₸ expire.
  const t=now();
  for(const [k,w] of [[1,'cleaner'],[2,'other']])f.db.raw.prepare("INSERT INTO cleaning_offers VALUES (?,?,?,?,?,?,3000,0,'expired',?,?,?)").run('o'+k,f.job.id,w,f.job.version,f.job.start,f.job.end,t-3600*k,t-3000*k,t-3000*k);
  const id=await offerCleaningPriceTip(f.db,'owner',t);assert.ok(id);
  const row=f.db.raw.prepare('SELECT * FROM cleaning_fee_tips WHERE id=?').get(id);assert.deepEqual([row.from_fee,row.to_fee,row.refused],[3000,4000,2]);
  assert.match(f.db.raw.prepare('SELECT body FROM notifications WHERE dedupe=?').get('owner:cleaning-fee:'+id).body,/^Цена уборки · «Test apartment»\. Исполнители 2 раза не взяли уборку/);
  assert.equal(await offerCleaningPriceTip(f.db,'owner',t+60),null,'one tip at a time');
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='cleaning-fee');
  assert.equal(card.acceptLabel,'Поставить 4 000 ₸');assert.deepEqual([card.cleaningTip.from,card.cleaningTip.to],[3000,4000]);
  const before=f.db.raw.prepare('SELECT version FROM cleaning_jobs WHERE id=?').get(f.job.id).version;
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/теперь 4\s000\s₸\. Открытую уборку предложу исполнителям заново/);
  const p=f.db.raw.prepare('SELECT cleaning_fee,cleaning_budget FROM property_policies WHERE property_id=?').get(f.property);assert.deepEqual([p.cleaning_fee,p.cleaning_budget],[4000,4000]);
  const job=f.db.raw.prepare('SELECT fee,version FROM cleaning_jobs WHERE id=?').get(f.job.id);assert.equal(job.fee,4000);assert.ok(job.version>before,'old offers are superseded');
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'}),e=>e.status===409);
  // At the new price nobody has refused yet: no new tip, even after the pause.
  assert.equal(await offerCleaningPriceTip(f.db,'owner',t+FEE_PAUSE+60),null);
  // «Оставить»: a month without the same question.
  f.db.raw.prepare("INSERT INTO cleaning_offers VALUES ('o3',?,'cleaner',?,?,?,4000,0,'declined',?,?,?)").run(f.job.id,job.version,f.job.start,f.job.end,t,t,t);
  f.db.raw.prepare("INSERT INTO cleaning_offers VALUES ('o4',?,'other',?,?,?,4000,0,'declined',?,?,?)").run(f.job.id,job.version,f.job.start,f.job.end,t,t,t);
  const next=await offerCleaningPriceTip(f.db,'owner',t+FEE_PAUSE+120);assert.ok(next);
  const again=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='cleaning-fee');
  assert.match((await f.owner.decideApproval('owner',{id:again.id,revision:again.revision,action:'reject'})).message,/оставляю/);
  assert.equal(await offerCleaningPriceTip(f.db,'owner',t+2*FEE_PAUSE+180),null);
 }finally{f.db.close();}
});

test('«Поставить» leaves a cleaning alone once a cleaner has accepted it at the old price',async()=>{
 const f=await fixture();try{
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,offerMinutes:10,expectedVersion:0});
  const t=now();
  for(const [k,w] of [[1,'cleaner'],[2,'other']])f.db.raw.prepare("INSERT INTO cleaning_offers VALUES (?,?,?,?,?,?,3000,0,'expired',?,?,?)").run('o'+k,f.job.id,w,f.job.version,f.job.start,f.job.end,t-3600*k,t-3000*k,t-3000*k);
  const id=await offerCleaningPriceTip(f.db,'owner',t);assert.ok(id);
  f.db.raw.prepare("UPDATE cleaning_offers SET id='ok',status='accepted',replacement_allowed=1,decided_at=? WHERE id='o2'").run(t);
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='cleaning-fee');
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});
  assert.doesNotMatch(r.message,/предложу/);
  const job=f.db.raw.prepare('SELECT fee,version FROM cleaning_jobs WHERE id=?').get(f.job.id);assert.deepEqual([job.fee,job.version],[3000,f.job.version]);
  assert.equal(f.db.raw.prepare("SELECT status FROM cleaning_offers WHERE id='ok'").get().status,'accepted');
 }finally{f.db.close();}
});
