import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';import {photo} from './fixtures/photo.mjs';
const {saveOperationRules,saveWorkerDispatch,coordinateDispatch,decideOffer,declineAssignment}=await load('dispatch');
const {saveEvidence,listEvidence,readEvidence}=await load('evidence');
test('offers need worker opt-in, retain exact terms, expire and cannot grant assignment before consent',async()=>{
 const f=await fixture();try{
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,offerMinutes:10,expectedVersion:0});
  assert.equal((await coordinateDispatch(f.owner)).offered,0);
  await saveWorkerDispatch(f.cleaner,{receiveOffers:true});assert.equal((await coordinateDispatch(f.owner)).offered,1);assert.equal((await coordinateDispatch(f.owner)).offered,0);
  const offer=f.db.raw.prepare('SELECT * FROM cleaning_offers').get();assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(f.job.id).assigned_to,null);
  await assert.rejects(decideOffer(f.guest,{id:offer.id,action:'accept'}),e=>e.status===403);
  f.db.raw.prepare('UPDATE cleaning_jobs SET fee=3100 WHERE id=?').run(f.job.id);await assert.rejects(decideOffer(f.cleaner,{id:offer.id,action:'accept'}),e=>e.status===409);
  await coordinateDispatch(f.owner);assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_offers WHERE id=?').get(offer.id).status,'superseded');
 }finally{f.db.close();}
});
test('accepted offer creates a real application; worker may decline before start and owner is notified',async()=>{
 const f=await fixture();try{
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,autoReplace:true,offerMinutes:10,expectedVersion:0});await saveWorkerDispatch(f.cleaner,{receiveOffers:true});await coordinateDispatch(f.owner);
  const offer=f.db.raw.prepare('SELECT * FROM cleaning_offers').get();await decideOffer(f.cleaner,{id:offer.id,action:'accept'});const application=f.db.raw.prepare('SELECT * FROM applications WHERE job_id=?').get(f.job.id);assert.equal(application.status,'pending');
  await f.owner.jobAction(f.job.id,{action:'assign',applicationId:application.id});await declineAssignment(f.cleaner,{jobId:f.job.id,reason:'Schedule changed'});
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'open');assert.ok(f.db.raw.prepare("SELECT id FROM notifications WHERE dedupe LIKE 'owner:assignment-declined:%'").get());
 }finally{f.db.close();}
});
test('required before/after evidence gates submission; photos remain scoped to the owner and assigned worker',async()=>{
 const f=await fixture();try{
  await saveOperationRules(f.owner,{propertyId:f.property,requirePhotos:true,offerMinutes:10,expectedVersion:0});
  await f.cleaner.jobAction(f.job.id,{action:'apply'});const app=f.db.raw.prepare('SELECT * FROM applications WHERE job_id=?').get(f.job.id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,f.job.id);
  await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
  const report={action:'submit',checklist:[true,true,true,true],report:'Cleaned and checked'};await assert.rejects(f.cleaner.jobAction(f.job.id,report),e=>e.status===409);
  const before=await saveEvidence(f.cleaner,{jobId:f.job.id,phase:'before',data:photo});await assert.rejects(f.cleaner.jobAction(f.job.id,report),e=>e.status===409);
  await saveEvidence(f.cleaner,{jobId:f.job.id,phase:'after',data:photo});await f.cleaner.jobAction(f.job.id,report);await f.owner.jobAction(f.job.id,{action:'approve'});
  assert.equal((await listEvidence(f.owner,'owner',f.job.id)).length,2);assert.match((await readEvidence(f.cleaner,'cleaner',before.id)).data,/^data:image\/jpeg/);
  await assert.rejects(readEvidence(f.guest,'guest',before.id),e=>e.status===403);await assert.rejects(listEvidence(f.other,'owner',f.job.id),e=>e.status===403);
 }finally{f.db.close();}
});
test('automatic replacement honours accepted no-show terms, vacancy and a grace period after late acceptance',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-7200,now()-3600,now()+1800,f.booking);await f.owner.bookingAction(f.booking,{action:'checkout'});
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-1800,now()+3600,f.job.id);
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,autoReplace:true,offerMinutes:10,expectedVersion:0});await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,autoAssign:true});await saveWorkerDispatch(f.cleaner,{receiveOffers:true});
  await f.other.saveProfile({name:'Reserve cleaner',contact:'test',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'Test',availability:'By agreement'});await saveWorkerDispatch(f.other,{receiveOffers:true});
  await coordinateDispatch(f.owner);const offer=f.db.raw.prepare("SELECT * FROM cleaning_offers WHERE status='offered'").get(),worker=offer.worker_id==='cleaner'?f.cleaner:f.other,reserve=offer.worker_id==='cleaner'?f.other:f.cleaner;
  await decideOffer(worker,{id:offer.id,action:'accept'});const app=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=? AND user_id=?').get(f.job.id,offer.worker_id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});
  await coordinateDispatch(f.owner);assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'assigned');
  f.db.raw.prepare('UPDATE cleaning_offers SET decided_at=? WHERE id=?').run(now()-1800,offer.id);await coordinateDispatch(f.owner);
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'open');assert.equal(f.db.raw.prepare("SELECT worker_id FROM cleaning_offers WHERE status='offered'").get().worker_id,reserve.userId);
 }finally{f.db.close();}
});
