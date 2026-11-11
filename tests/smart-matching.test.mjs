import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {matchingInput,rankMatches,previewMatches,matchingAction,matchingState}=await load('smart-matching');
// Booking must repeat the requested dates exactly. Fix them once: recomputing from the clock made a test fail whenever a second passed between the request and the booking.
const base=now();
const input=()=>({city:'Павлодар',start:iso(base+86400),end:iso(base+172800),guests:'2',mode:'daily',maxPrice:'11000',priority:'balanced',features:[]});
async function enabled(){const f=await fixture();await matchingAction(f.owner,'owner','preference',{propertyId:f.property,enabled:true});return f;}
test('matching validates constraints, whole-period budget and mandatory amenities; location is coarse',async()=>{
 assert.throws(()=>matchingInput({...input(),mode:'nightly'}));assert.throws(()=>matchingInput({...input(),features:['not_real']}));assert.throws(()=>matchingInput({...input(),near:{longitude:'76',latitude:52}}));
 assert.equal(matchingInput({...input(),near:{longitude:76.96743,latitude:52.28563}}).near.longitude,76.97);
 const f=await fixture();try{assert.equal((await previewMatches(f.guest,input())).properties.length,1);assert.equal((await previewMatches(f.guest,{...input(),end:iso(now()+3*86400)})).properties.length,0);assert.equal((await previewMatches(f.guest,{...input(),features:['parking']})).properties.length,0);assert.equal((await previewMatches(f.guest,{...input(),district:'Другой район'})).properties.length,0);}finally{f.db.close();}
});
test('enquiries require opt-in and explicit consent, are idempotent, and never hold accommodation',async()=>{
 const f=await fixture();try{
  assert.equal((await previewMatches(f.guest,input())).properties[0].quickRequest,false);
  await assert.rejects(matchingAction(f.guest,'guest','begin',{...input(),requestKey:'missing'}));
  const empty=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'empty',consent:true});assert.equal(empty.sent,0);
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,enabled:true});const body={...input(),requestKey:'request',consent:true};const first=await matchingAction(f.guest,'guest','begin',body),again=await matchingAction(f.guest,'guest','begin',body);assert.equal(first.id,again.id);assert.equal(first.sent,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);assert.equal((await previewMatches(f.guest,input())).properties.length,1);
  await assert.rejects(matchingAction(f.other,'owner','respond',{offerId:first.offers[0].id,decision:'accept',ready:true}));await assert.rejects(matchingState(f.other,first.id));
  const inbox=await matchingAction(f.owner,'owner','inbox',{});assert.equal(inbox.offers.length,1);assert.doesNotMatch(JSON.stringify(inbox),/PRIVATE ADDRESS|guest_id|Guest|\"contact\"/);
 }finally{f.db.close();}
});
test('owner response requires readiness; guest alone can book once, after reviewing terms',async()=>{
 const f=await enabled();try{
  const request=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'book-flow',consent:true}),offerId=request.offers[0].id;
  await assert.rejects(matchingAction(f.owner,'owner','respond',{offerId,decision:'accept'}));await matchingAction(f.owner,'owner','respond',{offerId,decision:'accept',ready:true});
  const ready=await matchingState(f.guest,request.id);assert.equal(ready.status,'ready');assert.equal(ready.properties[0].ownerConfirmed,true);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
  await assert.rejects(matchingAction(f.guest,'guest','book',{id:request.id,offerId}));
  const first=await matchingAction(f.guest,'guest','book',{...input(),billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:1,id:request.id,offerId,acceptTerms:true}),again=await matchingAction(f.guest,'guest','book',{...input(),billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:1,id:request.id,offerId,acceptTerms:true});assert.equal(first.id,again.id);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,2);assert.equal((await matchingState(f.guest,request.id)).status,'booked');assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(first.id).status,'requested');
 }finally{f.db.close();}
});
test('price changes, booking races, cancellation and expiry invalidate preliminary proposals',async()=>{
 const f=await enabled();try{
  const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'stale',consent:true}),offerId=r.offers[0].id;await matchingAction(f.owner,'owner','respond',{offerId,decision:'accept',ready:true});
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,dailyPrice:10500});assert.equal((await matchingState(f.guest,r.id)).properties.length,0);await assert.rejects(matchingAction(f.guest,'guest','book',{id:r.id,offerId,acceptTerms:true}),e=>e.status===409);
  const next=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'cancel',consent:true});await matchingAction(f.guest,'guest','cancel',{id:next.id});await assert.rejects(matchingAction(f.owner,'owner','respond',{offerId:next.offers[0].id,decision:'accept',ready:true}));
  const expired=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'expire',consent:true});f.db.raw.prepare('UPDATE matching_offers SET expires_at=? WHERE request_id=?').run(now()-1,expired.id);assert.equal((await matchingState(f.guest,expired.id)).status,'empty');
 }finally{f.db.close();}
});
test('ranking never relaxes a hard constraint and is stable for equal candidates',()=>{
 const f=matchingInput({...input(),near:{longitude:77,latitude:52,radius:5000}}),home=(id,amount,lon=77)=>({id,district:'Центр',estimate:{amount},location:{longitude:lon,latitude:52},details:{amenities:[]},display_status:{code:'ready'}});
 assert.deepEqual(rankMatches([home('b',10000),home('a',10000),home('too far',1000,79),home('too expensive',12000)],f).map(p=>p.id),['a','b']);
});
test('dispatch caps the wave at three properties and concurrent choices cannot create two bookings',async()=>{
 const f=await enabled();try{
  for(let i=0;i<4;i++){const p=await f.owner.createProperty({title:'Additional '+i,city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS '+i,description:'QA',price:10000,rooms:1,capacity:2,cleaningMinutes:90});await f.owner.savePolicy(p.id,{...f.policy,expectedVersion:0});await matchingAction(f.owner,'owner','preference',{propertyId:p.id,enabled:true});}
  let queries=0;const prepare=f.db.prepare.bind(f.db);f.db.prepare=(...args)=>{queries++;return prepare(...args);};
  const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'concurrent',consent:true});assert.equal(r.sent,3);assert.ok(queries<=42,'Initial matching should leave room for HTTP auth within the database query budget: '+queries);f.db.prepare=prepare;
  for(const o of r.offers)await matchingAction(f.owner,'owner','respond',{offerId:o.id,decision:'accept',ready:true});
  const body={...input(),billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:1,id:r.id,acceptTerms:true};
  const results=await Promise.allSettled(r.offers.slice(0,2).map(o=>matchingAction(f.guest,'guest','book',{...body,offerId:o.id})));
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM bookings WHERE request_key LIKE 'match:%'").get().n,1);
 }finally{f.db.close();}
});
test('reviewed dates and guest count cannot silently differ from the offered conditions',async()=>{
 const f=await enabled();try{const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'terms',consent:true}),offerId=r.offers[0].id;await matchingAction(f.owner,'owner','respond',{offerId,decision:'accept',ready:true});await assert.rejects(matchingAction(f.guest,'guest','book',{...input(),guests:'1',billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:1,id:r.id,offerId,acceptTerms:true}),e=>e.status===409);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM bookings WHERE request_key LIKE 'match:%'").get().n,0);}finally{f.db.close();}
});
test('background continuation sends the next wave without an open guest screen and stops after cancellation',async()=>{
 const {advanceMatchingRequests}=await load('matching-background'),f=await enabled();try{
  for(let i=0;i<3;i++){const p=await f.owner.createProperty({title:'Background '+i,city:'Павлодар',district:'Центр',address:'QA '+i,description:'QA',price:10000,rooms:1,capacity:2,cleaningMinutes:90});await f.owner.savePolicy(p.id,{...f.policy,expectedVersion:0});await matchingAction(f.owner,'owner','preference',{propertyId:p.id,enabled:true});}
  const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'background',consent:true});assert.equal(r.sent,3);for(const o of r.offers)await matchingAction(f.owner,'owner','respond',{offerId:o.id,decision:'decline'});
  const config={SITE_PUBLIC_URL:'https://rental.example.test',ADMINISTRATOR_RUNNER_SECRET:'isolated-runner-test'},transport=async(url,options)=>{assert.equal(String(url),'https://rental.example.test/api/internal/matching-advance');assert.equal(options.headers.Authorization,'Bearer isolated-runner-test');await matchingState(f.guest,JSON.parse(options.body).id);return new Response('{}');};
  assert.equal((await advanceMatchingRequests(f.db,config,transport)).advanced,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM matching_offers WHERE request_id=?').get(r.id).n,4);await matchingAction(f.guest,'guest','cancel',{id:r.id});assert.equal((await advanceMatchingRequests(f.db,config,transport)).advanced,0);
 }finally{f.db.close();}
});
test('matching joins the real booking, authorised cleaner dispatch, checkout and report chain',async()=>{
 const {saveOperationRules,saveWorkerDispatch,decideOffer}=await load('dispatch'),{checkAdministratorOwner}=await load('administrator-runtime'),f=await enabled();try{
  const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'whole-chain',consent:true}),offerId=r.offers[0].id;await matchingAction(f.owner,'owner','respond',{offerId,decision:'accept',ready:true});
  const booking=await matchingAction(f.guest,'guest','book',{...input(),billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:1,id:r.id,offerId,acceptTerms:true});await f.owner.bookingAction(booking.id,{action:'confirm',cleaningFee:3000});
  const job=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE booking_id=?').get(booking.id);assert.ok(job);assert.equal(job.assigned_to,null);
  await saveOperationRules(f.owner,{propertyId:f.property,autoOffers:true,offerMinutes:10,expectedVersion:0});await saveWorkerDispatch(f.cleaner,{receiveOffers:true});await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,autoAssign:true});await checkAdministratorOwner(f.db,'owner');
  const workOffer=f.db.raw.prepare("SELECT * FROM cleaning_offers WHERE job_id=? AND status='offered'").get(job.id);assert.ok(workOffer);await decideOffer(f.cleaner,{id:workOffer.id,action:'accept'});f.release();await checkAdministratorOwner(f.db,'owner');assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,'cleaner');
  await assert.rejects(f.cleaner.jobAction(job.id,{action:'start'}),/не раньше чем за час/);
  await f.owner.bookingAction(f.booking,{action:'cancel'});f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,booking.id);f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,job.id);await f.owner.bookingAction(booking.id,{action:'checkout'});await f.cleaner.jobAction(job.id,{action:'start'});await f.cleaner.jobAction(job.id,{action:'submit',report:'Изолированный отчёт: все зоны проверены.',checklist:[true,true,true,true]});await f.owner.jobAction(job.id,{action:'approve'});const finished=f.db.raw.prepare('SELECT status,settled_at FROM cleaning_jobs WHERE id=?').get(job.id);assert.equal(finished.status,'completed');assert.equal(finished.settled_at,null);
 }finally{f.db.close();}
});
test('a cancellation racing booking never reports success for an already claimed reservation',async()=>{
 const f=await enabled();try{const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'cancel-race',consent:true}),offerId=r.offers[0].id;await matchingAction(f.owner,'owner','respond',{offerId,decision:'accept',ready:true});const results=await Promise.allSettled([matchingAction(f.guest,'guest','book',{...input(),billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:1,id:r.id,offerId,acceptTerms:true}),matchingAction(f.guest,'guest','cancel',{id:r.id})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const count=f.db.raw.prepare("SELECT COUNT(*) n FROM bookings WHERE request_key LIKE 'match:%'").get().n;assert.equal(count,results[0].status==='fulfilled'?1:0);}finally{f.db.close();}
});
