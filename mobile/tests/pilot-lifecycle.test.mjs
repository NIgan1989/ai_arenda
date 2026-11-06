import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createApp} from '../server/app.mjs';
import {photo} from '../../tests/fixtures/photo.mjs';

test('pilot HTTP lifecycle: import, admission, booking, partial funds, cleaning evidence and human resolution',async t=>{
 const root=resolve('outputs');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'pilot-lifecycle-')),filename=join(folder,'fixture.sqlite');let app,base,owner,guest,cleaner,stranger,property,booking,job,mediaId;
 const now=()=>Math.floor(Date.now()/1000),iso=seconds=>new Date(seconds*1000).toISOString();
 async function start(adminIds=''){app=createApp({filename,maintenance:false,adminIds,operationsConfig:{TELEGRAM_BOT_TOKEN:'',SMS_GATEWAY_TOKEN:'',WHATSAPP_GATEWAY_TOKEN:'',PAYMENT_GATEWAY_TOKEN:'',ACCESS_ENCRYPTION_KEY:'fixture-lifecycle-key-'.repeat(3)}});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+app.server.address().port;}
 async function call(path,body,account,role='owner'){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(account?{Authorization:'Bearer '+account.token,'X-Workspace-Role':role}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
 async function ok(path,body,account,role='owner'){const result=await call(path,body,account,role);assert.equal(result.status,200,path+': '+JSON.stringify(result.body));return result.body;}
 const state=(account,role='owner')=>ok('/api/state',undefined,account,role),ops=(account,role='owner')=>ok('/api/operations/state',undefined,account,role);
 const listing={title:'Lifecycle imported apartment',city:'Павлодар',district:'Центр',address:'PRIVATE LIFECYCLE ADDRESS',description:'Учебная квартира только для проверки полного рабочего процесса. Отдельная спальня, кухня, рабочее место и тихий двор.',price:10000,rooms:1,capacity:2,cleaningMinutes:90};
 const listingForm=(record,published=true,extra={})=>({...listing,photos:[mediaId],published,expectedVersion:record.listing_version,policyVersion:record.policy.version,details:{type:'studio',area:35,beds:2,bathrooms:1,floor:1,floors:5,checkinMethod:'meet',amenities:['wifi','kitchen']},rental:{hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'Учебные условия: депозит после фактической проверки.'},...extra});
 async function review(account,role,propertyId){await ok('/api/operations/reviews/request',{...(propertyId?{propertyId}:{}),reference:'Fixture evidence presented for actual human check'},account,role);const reviews=(await ops(owner)).security.pendingReviews,request=reviews.find(r=>r.user_id===account.user.id&&(!propertyId||r.property_id===propertyId));assert.ok(request);await ok('/api/operations/reviews/decide',{id:request.id,expectedVersion:request.version,status:'approved',method:'Fixture manual review',notes:'Checked the current fixture identity and property'},owner);}
 async function money(kind,amount,key,extra={}){return ok('/api/operations/finance',{kind,amount,confirmed:true,note:'Fixture external transfer reconciled',requestKey:key,...(kind==='job_payment'?{jobId:job}:{bookingId:booking}),...extra},owner);}
 try{
  await start();
  for(const [login,roles] of [['pilot_owner',['owner','guest']],['pilot_guest',['guest']],['pilot_cleaner',['cleaner']],['pilot_other',['owner']]]){
   const account=await ok('/auth/register',{login,password:'fixture-pilot-password'});await ok('/api/profile',{name:login,contact:'fixture contact',city:'Павлодар',roles,districts:'Центр',experience:'Fixture experience',availability:'By agreement'},account);if(login==='pilot_owner')owner=account;if(login==='pilot_guest')guest=account;if(login==='pilot_cleaner')cleaner=account;if(login==='pilot_other')stranger=account;
  }
  await app.close();app=null;await start(owner.user.id);
  await t.test('server administrator policy and account-wide AI budget remain isolated from declared body identities',async()=>{
   const policy=(await ops(owner)).governance.policy;
   assert.equal((await call('/api/operations/governance/policy',{expectedVersion:policy.version,requireOwnerReview:true,requireCleanerReview:true,requirePhone:false,confirmed:true,platformAdmin:true},stranger)).status,403);
   await ok('/api/operations/governance/policy',{expectedVersion:policy.version,requireOwnerReview:true,requireCleanerReview:true,requirePhone:false,confirmed:true},owner);
   await ok('/api/operations/ai-budget',{expectedVersion:0,enabled:false,dailyRequestLimit:12,dailyTokenLimit:50000,dailyUsdCap:null,userId:guest.user.id},owner);
   assert.equal((await ops(owner,'guest')).aiBudget.preferences.enabled,0);assert.equal((await ops(guest,'guest')).aiBudget.preferences.enabled,1);
  });
  await t.test('import preview, explicit commit and retries create one private draft',async()=>{
   mediaId=(await ok('/api/media',{kind:'property',data:photo},owner)).id;
   const input={format:'json',source:'krisha',content:JSON.stringify([{...listing,photos:[mediaId],externalId:'own-original-fixture'}])};assert.equal((await call('/api/operations/import/preview',input,guest,'guest')).status,403);
   const preview=(await ok('/api/operations/import/preview',input,owner)).preview;assert.equal(preview.readyCount,1);
   const commit={id:preview.id,payloadHash:preview.payloadHash,expectedVersion:preview.version,rowNumbers:[1]};assert.equal((await call('/api/operations/import/commit',commit,owner)).status,400);
   const first=await ok('/api/operations/import/commit',{...commit,confirmed:true},owner),again=await ok('/api/operations/import/commit',{...commit,confirmed:true},owner);assert.deepEqual(again.propertyIds,first.propertyIds);property=first.propertyIds[0];assert.equal((await state(owner)).ownProperties.length,1);assert.equal(app.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(property).published,0);
   assert.equal((await ok('/api/catalog',undefined,guest,'guest')).properties.length,0);assert.equal((await call('/api/media/'+mediaId,undefined,guest,'guest')).status,404);
  });
  await t.test('publication requires an approved current object review and the gallery becomes visible only after publication',async()=>{
   let record=(await state(owner)).ownProperties[0];assert.equal((await call('/api/listings/'+property,listingForm(record),owner)).status,409);
   await review(owner,'owner',property);await ok('/api/listings/'+property,listingForm(record),owner);
   const catalogue=await ok('/api/catalog',undefined,guest,'guest');assert.equal(catalogue.properties.length,1);assert.equal(catalogue.properties[0].address,undefined);assert.equal((await call('/api/media/'+mediaId,undefined,guest,'guest')).status,200);
  });
  await t.test('booking and cleaner appointment recheck authority, and a declined assignment can be offered again',async()=>{
   const start=now()+3600;booking=(await ok('/api/bookings',{propertyId:property,start:iso(start),end:iso(start+7200),billingMode:'hourly',guests:1,requestKey:'pilot-booking',acceptTerms:true},guest,'guest')).id;await ok('/api/bookings/'+booking,{action:'confirm',cleaningFee:3000},owner);job=(await state(owner)).jobs[0].id;
   await ok('/api/jobs/'+job,{action:'apply'},cleaner,'cleaner');let application=(await state(owner)).applications.find(a=>a.job_id===job&&a.user_id===cleaner.user.id);assert.equal((await call('/api/jobs/'+job,{action:'assign',applicationId:application.id},owner)).status,409);
   await review(cleaner,'cleaner');await ok('/api/jobs/'+job,{action:'assign',applicationId:application.id},owner);assert.equal((await call('/api/jobs/'+job,{action:'assign',applicationId:application.id},stranger)).status,403);
   await ok('/api/operations/dispatch/decline',{jobId:job,reason:'Fixture schedule conflict before start'},cleaner,'cleaner');assert.equal((await state(owner)).jobs[0].status,'open');
  });
  await t.test('partial actual funds and a physical readiness decision gate check-in and owner-confirmed checkout',async()=>{
   // Advance only fixture schedule fields so HTTP business transitions can be exercised without waiting hours.
   const time=now();app.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(time-60,time+7140,time+12540,booking);
   let record=(await state(owner)).ownProperties[0];await ok('/api/properties/'+property+'/readiness',{readiness:'ready',expectedVersion:record.operation.version,inspected:true,note:'Fixture inspection completed'},owner);
   await money('payment',1000,'pilot-pay-one');assert.equal((await call('/api/bookings/'+booking,{action:'checkin'},owner)).status,409);await money('payment',3000,'pilot-pay-two');await money('deposit',4000,'pilot-deposit-one');assert.equal((await call('/api/bookings/'+booking,{action:'checkin'},owner)).status,409);await money('deposit',6000,'pilot-deposit-two');await ok('/api/bookings/'+booking,{action:'checkin'},owner);
   assert.equal((await call('/api/jobs/'+job,{action:'start'},cleaner,'cleaner')).status,403);
   await ok('/api/bookings/'+booking,{action:'report_checkout'},guest,'guest');assert.equal((await call('/api/bookings/'+booking,{action:'checkout'},guest,'guest')).status,403);await ok('/api/bookings/'+booking,{action:'checkout'},owner);assert.equal((await state(owner)).bookings[0].status,'completed');assert.equal((await state(owner)).ownProperties[0].operation.readiness,'awaiting_cleaning');
  });
  await t.test('accepted retry, required private before/after evidence and acceptance do not imply a payout',async()=>{
   const time=now();app.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(time+15,time+5415,job);
   await ok('/api/operations/rules',{propertyId:property,expectedVersion:0,autoOffers:false,autoReplace:false,requirePhotos:true,offerMinutes:10},owner);
   await ok('/api/jobs/'+job,{action:'apply'},cleaner,'cleaner');const application=(await state(owner)).applications.find(a=>a.job_id===job&&a.user_id===cleaner.user.id);await ok('/api/jobs/'+job,{action:'assign',applicationId:application.id},owner);await ok('/api/jobs/'+job,{action:'start'},cleaner,'cleaner');
   const report={action:'submit',checklist:[true,true,true,true],report:'Fixture cleaning completed and checked'};assert.equal((await call('/api/jobs/'+job,report,cleaner,'cleaner')).status,409);
   await ok('/api/operations/evidence',{jobId:job,phase:'before',data:photo,note:'Fixture before'},cleaner,'cleaner');await ok('/api/operations/evidence',{jobId:job,phase:'after',data:photo,note:'Fixture after'},cleaner,'cleaner');
   assert.equal((await call('/api/operations/evidence/'+job,undefined,guest,'guest')).status,403);assert.equal((await call('/api/operations/evidence/'+job,undefined,stranger)).status,403);assert.equal((await ok('/api/operations/evidence/'+job,undefined,owner)).photos.length,2);
   const clip=Buffer.alloc(600000);clip.write('ftyp',4);const video='data:video/mp4;base64,'+clip.toString('base64'),savedVideo=await ok('/api/operations/evidence',{jobId:job,phase:'after',kind:'video',data:video,width:640,height:480,duration:12},cleaner,'cleaner');assert.equal((await ok('/api/operations/evidence/'+savedVideo.id+'/photo',undefined,owner)).data,video);assert.equal((await call('/api/operations/evidence/'+savedVideo.id+'/photo',undefined,guest,'guest')).status,403);
   await ok('/api/jobs/'+job,report,cleaner,'cleaner');await ok('/api/jobs/'+job,{action:'approve'},owner);const completed=(await state(owner)).jobs[0];assert.equal(completed.status,'completed');assert.equal(completed.settled_at,null);assert.equal((await state(owner)).ownProperties[0].operation.readiness,'ready');
   await money('job_payment',1500,'pilot-job-one');await money('job_payment',1500,'pilot-job-two');await money('deposit_return',4000,'pilot-return-one');await money('deposit_return',6000,'pilot-return-two');assert.ok((await state(owner)).jobs[0].settled_at);assert.equal((await state(owner)).bookings[0].terms.deposit_balance,0);
  });
  await t.test('an operator handles a scoped dispute without changing financial facts or physical readiness',async()=>{
   await ok('/api/bookings/'+booking,{action:'issue',issue:'Fixture follow-up clarification',requestKey:'pilot-issue'},guest,'guest');let ticket=(await ops(owner)).governance.tickets[0];assert.ok(ticket);assert.equal((await ops(stranger)).governance.tickets.length,0);
   assert.equal((await call('/api/operations/governance/ticket',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'claim',platformAdmin:true},guest,'guest')).status,403);await ok('/api/operations/governance/ticket',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'claim'},owner);
   ticket=(await ops(owner)).governance.tickets[0];await ok('/api/operations/governance/ticket',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'note',note:'PRIVATE OPERATOR FIXTURE',visibility:'operators'},owner);assert.ok(!JSON.stringify((await ops(guest,'guest')).governance).includes('PRIVATE OPERATOR FIXTURE'));
   ticket=(await ops(owner)).governance.tickets[0];const entries=app.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n;await ok('/api/operations/governance/ticket',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'resolve',note:'Both participants received clarification',confirmed:true},owner);assert.equal((await ops(guest,'guest')).governance.tickets[0].status,'resolved');assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n,entries);assert.equal((await state(owner)).ownProperties[0].operation.readiness,'ready');
  });
  await t.test('expired property approval hides public catalogue and media while keeping owner access',async()=>{
   app.db.raw.prepare("UPDATE participant_reviews SET valid_until=? WHERE user_id=? AND role='owner' AND property_id=?").run(now()-1,owner.user.id,property);
   assert.equal((await ok('/api/catalog',undefined,guest,'guest')).properties.length,0);assert.equal((await call('/api/media/'+mediaId,undefined,guest,'guest')).status,404);assert.equal((await call('/api/media/'+mediaId,undefined,owner)).status,200);
   const quote=await call('/api/quote',{propertyId:property,start:iso(now()+86400),end:iso(now()+93600),billingMode:'hourly',guests:1},guest,'guest');assert.ok([403,404,409].includes(quote.status));
  });
 }finally{if(app)await app.close();const target=resolve(folder);assert.ok(target.startsWith(root+sep)&&target.startsWith(join(root,'pilot-lifecycle-')));rmSync(target,{recursive:true,force:true});}
});
