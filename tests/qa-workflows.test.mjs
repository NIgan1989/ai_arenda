import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';import {photo} from './fixtures/photo.mjs';
const {writeOperations}=await load('operations-api'),{recordFinance}=await load('finance'),{saveEvidence}=await load('evidence'),{saveOperationRules}=await load('dispatch');
const policy=(version,enabled)=>({expectedVersion:version,requireOwnerReview:enabled,requireCleanerReview:enabled,requirePhone:enabled,confirmed:true});
test('isolated QA cannot accidentally activate blocking identity requirements, while working policy and authority checks stay intact',async()=>{
 const f=await fixture();try{
  await assert.rejects(writeOperations(f.owner,'owner',['governance','policy'],policy(1,true),{TEST_DATA_ONLY:'1'},true),e=>e.status===409);
  await assert.rejects(writeOperations(f.owner,'owner',['governance','policy'],policy(1,false),{TEST_DATA_ONLY:'1'},false),e=>e.status===403);
  await writeOperations(f.owner,'owner',['governance','policy'],policy(1,true),{},true);
  assert.equal((await f.guest.publicSearch()).total,0);
  await writeOperations(f.owner,'owner',['governance','policy'],policy(2,false),{TEST_DATA_ONLY:'1'},true);
  assert.equal((await f.guest.publicSearch()).total,1);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM participant_reviews WHERE status='approved'").get().n,0);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM phone_verifications WHERE verified_at IS NOT NULL').get().n,0);
 }finally{f.db.close();}
});
test('ungated test identities can complete booking and cleaning, but actual workflow confirmations and evidence remain mandatory',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE pilot_policy SET require_owner_review=1,require_cleaner_review=1,require_phone=1').run();
  await writeOperations(f.owner,'owner',['governance','policy'],policy(1,false),{TEST_DATA_ONLY:'1'},true);
  const property=(await f.owner.createProperty({title:'Учебная цепочка',city:'Павлодар',district:'Центр',address:'Учебный адрес',description:'Синтетическая цепочка, временная база теста',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  await f.owner.savePolicy(property,f.policy);await saveOperationRules(f.owner,{propertyId:property,requirePhotos:true,offerMinutes:10,expectedVersion:0});
  const request={propertyId:property,start:iso(now()+259200),end:iso(now()+266400),guests:1,billingMode:'hourly',acceptTerms:true,requestKey:'qa-complete'};
  const quote=await f.guest.bookingQuote(request),booking=(await f.guest.createBooking({...request,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version})).id;
  await f.owner.bookingAction(booking,{action:'confirm',cleaningFee:3000});
  const job=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE booking_id=?').get(booking);
  await f.cleaner.jobAction(job.id,{action:'apply'});const app=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(job.id);await f.owner.jobAction(job.id,{action:'assign',applicationId:app.id});
  // Advance only this temporary fixture's timetable; no live booking or physical action is changed.
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-60,now()+1800,now()+7200,booking);f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+1800,now()+7200,job.id);
  const op=f.db.raw.prepare('SELECT version FROM property_operations WHERE property_id=?').get(property);await f.owner.readinessAction(property,{readiness:'ready',expectedVersion:op.version,inspected:true,note:'Учебный осмотр в временной базе'});
  await assert.rejects(f.owner.bookingAction(booking,{action:'checkin'}),e=>e.status===409);
  const money=(kind,amount)=>recordFinance(f.owner,{kind,amount,bookingId:booking,confirmed:true,note:'Учебная запись, банковского перевода нет',requestKey:'qa-'+kind});
  await money('payment',quote.amount);await money('deposit',quote.policy.deposit);await f.owner.bookingAction(booking,{action:'checkin'});
  await assert.rejects(f.cleaner.jobAction(job.id,{action:'start'}));
  await f.guest.bookingAction(booking,{action:'report_checkout'});await f.owner.bookingAction(booking,{action:'checkout'});await f.cleaner.jobAction(job.id,{action:'start'});
  const report={action:'submit',checklist:[true,true,true,true],report:'Учебная уборка выполнена'};await assert.rejects(f.cleaner.jobAction(job.id,report),e=>e.status===409);
  for(const phase of ['before','after'])await saveEvidence(f.cleaner,{jobId:job.id,phase,data:photo});
  await f.cleaner.jobAction(job.id,report);await f.owner.jobAction(job.id,{action:'approve'});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(booking).status,'completed');
  const result=f.db.raw.prepare('SELECT status,settled_at FROM cleaning_jobs WHERE id=?').get(job.id);assert.equal(result.status,'completed');assert.equal(result.settled_at,null);
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(property).readiness,'ready');
 }finally{f.db.close();}
});
