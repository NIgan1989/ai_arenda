import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {coordinateDispatch,decideOffer,saveWorkerDispatch,declineAssignment}=await load('dispatch');
const {regularState,pinRegular,unpinRegular,cleanerRegulars,markCleanerPayout,ownerAvailable,pairTermsText}=await load('regular-cleaner');
const topUp=(f,amount)=>f.db.raw.prepare("INSERT INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) VALUES (?,?,?,?,?,?,?,?)").run('e'+amount+Math.random(),'owner','topup',amount,'Kaspi','admin','k'+Math.random(),now());
async function finish(f){
 f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,f.job.id);
 await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
 await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:[true,true,true,true],report:'Done'});await f.owner.jobAction(f.job.id,{action:'approve'});
}
const job=f=>f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
const hold=f=>f.db.raw.prepare('SELECT * FROM cleaning_holds WHERE job_id=?').get(f.job.id);

test('pinned cleaner gets the cleaning first without general offers, and her yes assigns her',async()=>{
 const f=await fixture();try{
  // Candidate: she answered this flat's cleaning before.
  await f.cleaner.jobAction(f.job.id,{action:'apply'});
  const state=await regularState(f.owner,f.property);assert.equal(state.regular,null);assert.equal(state.candidates[0].id,'cleaner');
  await pinRegular(f.owner,{propertyId:f.property,cleanerId:'cleaner'});
  assert.equal((await regularState(f.owner,f.property)).regular.id,'cleaner');
  assert.equal((await coordinateDispatch(f.owner)).offered,1);
  const offer=f.db.raw.prepare('SELECT * FROM cleaning_offers').get();assert.equal(offer.worker_id,'cleaner');
  assert.ok((await cleanerRegulars(f.cleaner)).flats.length===1);
  const r=await decideOffer(f.cleaner,{id:offer.id,action:'accept'});assert.equal(r.assigned,true);
  assert.equal(job(f).status,'assigned');assert.equal(job(f).assigned_to,'cleaner');
  assert.ok(f.db.raw.prepare("SELECT id FROM notifications WHERE dedupe LIKE 'owner:regular-assigned:%'").get());
  // No balance: no reserve.
  assert.equal(hold(f),undefined);
 }finally{f.db.close();}
});

test('reserve on assignment, due after acceptance, pair commission capped per month, payout settles the job',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE platform_billing SET enabled=1,starts_at=?,pair_rate_bp=500,pair_month_cap=100").run(now()-60);
  topUp(f,10000);await pinRegular(f.owner,{propertyId:f.property,cleanerId:'cleaner'});
  await coordinateDispatch(f.owner);const offer=f.db.raw.prepare('SELECT * FROM cleaning_offers').get();await decideOffer(f.cleaner,{id:offer.id,action:'accept'});
  assert.equal(hold(f).status,'held');assert.equal(hold(f).amount,3000);assert.equal(await ownerAvailable(f.db,'owner'),7000);
  await finish(f);
  assert.equal(hold(f).status,'due');
  const c=f.db.raw.prepare('SELECT * FROM cleaning_commissions WHERE job_id=?').get(f.job.id);assert.equal(c.pair,1);assert.equal(c.mode,'charged');assert.equal(c.amount,100);
  assert.equal(await ownerAvailable(f.db,'owner'),6900);
  await markCleanerPayout(f.owner,{jobId:f.job.id,confirmed:true});
  assert.equal(hold(f).status,'paid');assert.ok(job(f).settled_at);
  await assert.rejects(markCleanerPayout(f.owner,{jobId:f.job.id,confirmed:true}),e=>e.status===409);
  assert.deepEqual((await cleanerRegulars(f.cleaner)).money,{held:0,due:0,paid:3000});
 }finally{f.db.close();}
});

test('reserve is returned when the cleaner steps back; ordinary cleaning pays the base rate as shadow while billing is off',async()=>{
 const f=await fixture();try{
  topUp(f,5000);await f.cleaner.jobAction(f.job.id,{action:'apply'});const app=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(f.job.id);
  await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});assert.equal(hold(f).status,'held');
  await declineAssignment(f.cleaner,{jobId:f.job.id,reason:'Заболела'});assert.equal(hold(f).status,'returned');assert.equal(await ownerAvailable(f.db,'owner'),5000);
  await f.cleaner.jobAction(f.job.id,{action:'apply'});const again=f.db.raw.prepare("SELECT id FROM applications WHERE job_id=? AND status='pending'").get(f.job.id);
  await f.owner.jobAction(f.job.id,{action:'assign',applicationId:again.id});assert.equal(hold(f).status,'held');
  await finish(f);const c=f.db.raw.prepare('SELECT * FROM cleaning_commissions WHERE job_id=?').get(f.job.id);assert.equal(c.pair,0);assert.equal(c.mode,'shadow');assert.equal(c.amount,300);
 }finally{f.db.close();}
});

test('when the regular cleaner declines, the next ranked cleaner gets the offer; either side can end the pair',async()=>{
 const f=await fixture();try{
  await f.other.saveProfile({name:'Reserve cleaner',contact:'test',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'Test',availability:'By agreement'});await saveWorkerDispatch(f.other,{receiveOffers:true});
  await pinRegular(f.owner,{propertyId:f.property,cleanerId:'cleaner'});await coordinateDispatch(f.owner);
  const offer=f.db.raw.prepare('SELECT * FROM cleaning_offers').get();assert.equal(offer.worker_id,'cleaner');await decideOffer(f.cleaner,{id:offer.id,action:'decline'});
  assert.equal((await coordinateDispatch(f.owner)).offered,1);
  assert.equal(f.db.raw.prepare("SELECT worker_id FROM cleaning_offers WHERE status='offered'").get().worker_id,'other');
  assert.ok(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND body LIKE 'Постоянная уборщица не может%'").get());
  await assert.rejects(unpinRegular(f.other,'cleaner',{propertyId:f.property}),e=>e.status===404);
  await unpinRegular(f.cleaner,'cleaner',{propertyId:f.property});assert.equal((await regularState(f.owner,f.property)).regular,null);
 }finally{f.db.close();}
});

test('terms text says the service is free until billing starts',()=>{
 assert.match(pairTermsText({rate:1000,pairRate:500,cap:2000,active:false}),/^Сейчас сервис бесплатный/);
 assert.match(pairTermsText({rate:1000,pairRate:500,cap:2000,active:true}),/5% вместо 10%, не больше 2\s000 ₸ в месяц/);
});
