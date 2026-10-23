import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../server/app.mjs';
const folder=mkdtempSync(join(tmpdir(),'ai-arenda-api-'));
const filename=join(folder,'test.sqlite');let app,base,owner,guest,worker,property,booking,job;
async function start(adminIds=''){app=createApp({filename,maintenance:false,adminIds});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+app.server.address().port;}
async function call(path,body,token,method){const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(token?{Authorization:'Bearer '+token,'X-Workspace-Role':token===owner?.token?'owner':token===worker?.token?'cleaner':'guest'}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
before(()=>start());
after(async()=>{await app.close();const target=resolve(folder);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('ai-arenda-api-'));rmSync(target,{recursive:true,force:true});});
test('unauthenticated clients cannot read data; CORS rejects unapproved web origins',async()=>{
  assert.equal((await call('/api/state')).status,401);
  assert.equal((await call('/api/quote',{})).status,401);
  assert.equal((await call('/api/catalog')).status,401);
  const response=await fetch(base+'/health',{headers:{Origin:'https://unrelated.example'}});assert.equal(response.status,403);
});
test('registration hashes passwords; sessions store only token hashes',async()=>{
  for(const login of ['owner','guest','worker']){
    const result=await call('/auth/register',{login,password:'test-password-only'});assert.equal(result.status,200);
    if(login==='owner')owner=result.body;if(login==='guest')guest=result.body;if(login==='worker')worker=result.body;
  }
  assert.notEqual(app.db.raw.prepare('SELECT password FROM accounts LIMIT 1').get().password,'test-password-only');
  assert.notEqual(app.db.raw.prepare('SELECT hash FROM sessions WHERE user_id=?').get(owner.user.id).hash,owner.token);
  assert.equal((await call('/auth/login',{login:'owner',password:'incorrect-password'})).status,401);
});
test('different accounts complete a real booking and cleaning assignment with private addresses',async()=>{
  for(const [account,role]of [[owner,'owner'],[guest,'guest'],[worker,'cleaner']]){
    assert.equal((await call('/api/profile',{name:role,contact:'test contact',city:'Павлодар',roles:[role],districts:'Центр',experience:'Опыт',availability:'Днём'},account.token)).status,200);
  }
  property=(await call('/api/properties',{title:'Тест',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Тестовые условия',price:10000,rooms:1,capacity:2,cleaningMinutes:90},owner.token)).body.id;
  const state=(await call('/api/state',undefined,guest.token)).body;assert.equal(state.properties[0].address,undefined);
  const start=Date.now()+86400000,end=start+86400000;
  const request={propertyId:property,start:new Date(start).toISOString(),end:new Date(end).toISOString(),guests:2,requestKey:'http-test-1'};
  const results=await Promise.all([call('/api/bookings',request,guest.token),call('/api/bookings',request,guest.token)]);
  assert.equal(results[0].status,200);assert.equal(results[1].body.id,results[0].body.id);booking=results[0].body.id;
  assert.equal((await call('/api/bookings/'+booking,{action:'confirm'},guest.token)).status,403);
  assert.equal((await call('/api/bookings/'+booking,{action:'confirm',cleaningFee:4500},owner.token)).status,200);
  job=(await call('/api/state',undefined,owner.token)).body.jobs[0].id;
  assert.equal((await call('/api/state',undefined,worker.token)).body.jobs[0].address,null);
  assert.equal((await call('/api/jobs/'+job,{action:'apply'},worker.token)).status,200);
  const application=(await call('/api/state',undefined,owner.token)).body.applications[0];
  assert.equal((await call('/api/jobs/'+job,{action:'assign',applicationId:application.id},owner.token)).status,200);
  assert.equal((await call('/api/state',undefined,worker.token)).body.jobs[0].address,'PRIVATE ADDRESS');
  assert.equal((await call('/api/state',undefined,worker.token)).body.bookings.length,0);
});
test('catalogue requires the guest role while quotes verify the interval without reserving it',async()=>{
  const catalog=await call('/api/catalog',undefined,guest.token);assert.equal(catalog.status,200);assert.equal(catalog.body.properties.length,1);
  const item=catalog.body.properties[0];assert.equal(item.address,undefined);assert.equal(item.owner_id,undefined);
  const start=Date.now()+6*86400000,request={propertyId:property,start:new Date(start).toISOString(),end:new Date(start+86400000).toISOString(),guests:2};
  const count=app.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n;
  const quote=await call('/api/quote',request,guest.token);assert.equal(quote.status,200);assert.equal(quote.body.amount,10000);
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,count);
  const workspace=(await call('/api/state',undefined,worker.token)).body.workspaces.cleaner;
  assert.equal(workspace.activeJobs,1);assert.equal(workspace.activeBookings,0);
});

test('conversation and data persist across server restarts, with no account leakage',async()=>{
  const history={messages:[{id:'test-1',sender:'user',text:'Мои квартиры'}],flow:null,actor:'owner'};
  assert.equal((await call('/api/conversation',history,owner.token,'PUT')).status,200);
  assert.deepEqual((await call('/api/conversation',undefined,guest.token)).body.messages,[]);
  await app.close();await start();
  assert.deepEqual((await call('/api/conversation',undefined,owner.token)).body,history);
  assert.equal((await call('/api/state',undefined,owner.token)).body.ownProperties[0].id,property);
});
test('a repeated command creates one property; changing its payload is rejected',async()=>{
  const body={title:'Idempotency check',city:'Павлодар',district:'Центр',address:'Test only',description:'Test only',price:12000,rooms:1,capacity:2,cleaningMinutes:60};
  async function send(input){const response=await fetch(base+'/api/properties',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'X-Workspace-Role':'owner','Content-Type':'application/json','Idempotency-Key':'property-command-1'},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};}
  const before=(await call('/api/state',undefined,owner.token)).body.ownProperties.length;
  const [a,b]=await Promise.all([send(body),send(body)]);assert.equal(a.status,200);assert.equal(b.body.id,a.body.id);
  assert.equal((await call('/api/state',undefined,owner.token)).body.ownProperties.length,before+1);
  assert.equal((await send({...body,title:'Different payload'})).status,409);
});
test('manual cleaning cannot overlap a reservation or another cleaning job',async()=>{
  const start=Date.now()+86400000+3600000;
  const overlap={propertyId:property,start:new Date(start).toISOString(),end:new Date(start+3600000).toISOString(),fee:4000,description:'Test'};
  assert.equal((await call('/api/jobs',overlap,owner.token)).status,409);
  assert.equal((await call('/api/jobs',overlap,guest.token)).status,403);
  const j=(await call('/api/state',undefined,owner.token)).body.jobs.find(j=>j.id===job);
  assert.equal((await call('/api/jobs',{...overlap,start:new Date(j.start*1000).toISOString(),end:new Date(j.end*1000).toISOString()},owner.token)).status,409);
  assert.equal((await call('/api/jobs',{...overlap,start:'not a date'},owner.token)).status,400);
});
test('property policies and readiness enforce the authenticated owner, ignoring claimed identity',async()=>{
  const policy={expectedVersion:0,dailyPrice:10000,hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:15000,houseRules:'Test rules',autoConfirm:false,cleaningFee:3000,cleaningBudget:4000};
  assert.equal((await call('/api/properties/'+property+'/policy',policy)).status,401);
  assert.equal((await call('/api/properties/'+property+'/policy',{...policy,userId:owner.user.id,role:'owner'},worker.token)).status,403);
  assert.equal((await call('/api/properties/'+property+'/policy',policy,owner.token)).status,200);
  assert.equal((await call('/api/properties/'+property+'/policy',policy,owner.token)).status,409);
  const catalog=(await call('/api/catalog',undefined,guest.token)).body.properties.find(p=>p.id===property);
  assert.equal(catalog.policy.deposit,15000);assert.equal(catalog.policy.cleaning_budget,undefined);
  assert.equal((await call('/api/properties/'+property+'/readiness',{readiness:'ready',expectedVersion:1,note:'Test',inspected:true,userId:owner.user.id},guest.token)).status,403);
  assert.equal((await call('/api/bookings/'+booking,{action:'deposit_received',userId:owner.user.id},worker.token)).status,403);
});
test('entry exposes only identity until a registered role is selected',async()=>{
  const registered=await call('/auth/register',{login:'onboarding',password:'test-password-only'}),token=registered.body.token;
  const entry=await call('/api/access',undefined,token);assert.equal(entry.status,200);assert.equal(entry.body.profile,null);assert.equal(entry.body.bookings,undefined);
  const missing=await fetch(base+'/api/state',{headers:{Authorization:'Bearer '+token}});assert.equal(missing.status,403);
  assert.equal((await call('/api/state',undefined,token)).status,403);
  const wrong=await fetch(base+'/api/state',{headers:{Authorization:'Bearer '+guest.token,'X-Workspace-Role':'owner'}});assert.equal(wrong.status,403);
});
test('multi-role views, conversations and replayed actions remain scoped to the selected role',async()=>{
  assert.equal((await call('/api/profile',{name:'Owner',contact:'test',city:'Павлодар',roles:['owner','guest','cleaner'],districts:'Центр',experience:'test',availability:'test'},owner.token)).status,200);
  async function scoped(path,role,body,key){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+owner.token,'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};}
  const ownerState=await scoped('/api/state','owner'),guestState=await scoped('/api/state','guest'),cleanerState=await scoped('/api/state','cleaner');
  assert.ok(ownerState.body.ownProperties.length>0);assert.equal(guestState.body.ownProperties.length,0);assert.equal(guestState.body.jobs.length,0);assert.equal(cleanerState.body.bookings.length,0);
  assert.deepEqual((await scoped('/api/conversation','guest')).body.messages,[]);
  assert.equal((await scoped('/api/conversation','owner')).body.messages[0].text,'Мои квартиры');
  const payload={title:'Role receipt check',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'test',price:10000,rooms:1,capacity:2,cleaningMinutes:60};
  assert.equal((await scoped('/api/properties','owner',payload,'role-replay-key')).status,200);
  assert.equal((await scoped('/api/properties','guest',payload,'role-replay-key')).status,403);
  assert.equal((await scoped('/api/catalog','owner')).status,403);
});
test('assistant settings persist across restart and stay within the authenticated role',async()=>{
  const settings={expectedVersion:0,mode:'important',leadMinutes:120,repeatMinutes:60,quietEnabled:true,quietStart:'22:00',quietEnd:'08:00',urgentInQuiet:true};
  assert.equal((await call('/api/assistant-settings',settings)).status,401);
  assert.equal((await call('/api/assistant-settings',settings,owner.token)).status,200);
  assert.equal((await call('/api/assistant-settings',settings,owner.token)).status,409);
  assert.equal((await call('/api/assistant-settings',{...settings,role:'owner',mode:'reactive'},guest.token)).status,200);
  await app.close();await start();
  const ownerState=(await call('/api/state',undefined,owner.token)).body,guestState=(await call('/api/state',undefined,guest.token)).body;
  assert.equal(ownerState.assistantSettings.mode,'important');assert.equal(guestState.assistantSettings.mode,'reactive');
  assert.equal(guestState.assistantBrief.automatic,false);assert.equal(ownerState.assistantBrief.capabilities.modelActions,false);
});
test('schedule proposals use the authenticated role and persist consent and payment balance across restart',async()=>{
  const p=(await call('/api/properties',{title:'Calendar test',city:'Павлодар',district:'Test',address:'PRIVATE',description:'Test rules',price:10000,rooms:1,capacity:2,cleaningMinutes:90},owner.token)).body.id;
  const policy={expectedVersion:0,dailyPrice:10000,hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'Test rules',cleaningFee:3000,cleaningBudget:4000,maxDiscountPercent:15,repairBudget:20000,escalationContact:'Duty test contact'};
  assert.equal((await call('/api/properties/'+p+'/policy',policy,owner.token)).status,200);
  const t=Date.now()+20*86400000,request={propertyId:p,start:new Date(t).toISOString(),end:new Date(t+86400000).toISOString(),guests:1,requestKey:'http-change-stay',acceptTerms:true};
  const b=(await call('/api/bookings',request,guest.token)).body.id;
  assert.equal((await call('/api/bookings/'+b,{action:'confirm',cleaningFee:3000},owner.token)).status,200);
  assert.equal((await call('/api/bookings/'+b,{action:'paid'},owner.token)).status,200);
  const body={start:request.start,end:new Date(t+90000000).toISOString(),reason:'Extend test stay'};
  assert.equal((await call('/api/bookings/'+b+'/change-quote',{...body,role:'owner',discountPercent:10},guest.token)).status,403);
  assert.equal((await call('/api/bookings/'+b+'/change-quote',body,worker.token)).status,403);
  const q=(await call('/api/bookings/'+b+'/change-quote',body,guest.token)).body;assert.equal(q.amountDue,10000);
  const change=await call('/api/bookings/'+b+'/changes',{...body,requestKey:'http-change',expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true},guest.token);assert.equal(change.status,200);
  assert.equal((await call('/api/bookings/'+b+'/changes/'+change.body.id,{action:'accept',role:'owner'},guest.token)).status,403);
  await app.close();await start();
  const pending=(await call('/api/state',undefined,owner.token)).body.bookings.find(v=>v.id===b);assert.equal(pending.changes[0].status,'pending');assert.equal(pending.amount,10000);
  assert.equal((await call('/api/bookings/'+b+'/changes/'+change.body.id,{action:'accept'},owner.token)).status,200);
  await app.close();await start();
  const saved=(await call('/api/state',undefined,guest.token)).body.bookings.find(v=>v.id===b);assert.equal(saved.amount,20000);assert.equal(saved.terms.paid_amount,10000);assert.equal(saved.payment_status,'unpaid');assert.equal(saved.changes[0].status,'accepted');
  assert.equal((await call('/api/bookings/'+b+'/changes/'+change.body.id,{action:'accept'},owner.token)).status,200);
});

test('account settings persist and only a server-designated administrator can list every role',async()=>{
  assert.equal((await call('/api/admin/users?platformAdmin=true',undefined,owner.token)).status,403);
  const body={paymentProvider:'halyk',paymentNotifications:false,expectedVersion:0,platformAdmin:true};
  assert.equal((await call('/api/account',body,guest.token)).status,200);
  assert.equal((await call('/api/account',body,guest.token)).status,409);
  assert.equal((await call('/api/admin/users',undefined,guest.token)).status,403);
  await app.close();await start(owner.user.id);
  const a=(await call('/api/account',undefined,owner.token)).body;assert.equal(a.platformAdmin,true);assert.equal(a.settings.payment_provider,'undecided');
  const g=(await call('/api/account',undefined,guest.token)).body;assert.equal(g.platformAdmin,false);assert.equal(g.settings.payment_provider,'halyk');
  const list=await call('/api/admin/users?role=cleaner',undefined,owner.token);assert.equal(list.status,200);assert.ok(list.body.users.length>=1);assert.ok(list.body.users.every(u=>u.roles.includes('cleaner')));assert.equal(list.body.users[0].password,undefined);
  assert.equal((await call('/api/admin/users',undefined,worker.token)).status,403);
  await app.close();await start();assert.equal((await call('/api/admin/users',undefined,owner.token)).status,403);
});

test('approval cards and cleaning timers persist across HTTP server restarts',async()=>{
 const p=(await call('/api/properties',{title:'Approval lifecycle',city:'Павлодар',district:'Test',address:'PRIVATE',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:60},owner.token)).body.id;
 const t=Date.now()+30*86400000;
 const b=(await call('/api/bookings',{propertyId:p,start:new Date(t).toISOString(),end:new Date(t+86400000).toISOString(),guests:1,requestKey:'approval-http',acceptTerms:true},guest.token)).body.id;
 const incoming=(await call('/api/state',undefined,owner.token)).body.approvals.find(c=>c.kind==='booking'&&c.entityId===b);assert.ok(incoming);
 const body={id:incoming.id,revision:incoming.revision,action:'accept',cleaningFee:0};
 assert.equal((await call('/api/approvals',{...body,role:'owner'},guest.token)).status,403);
 await app.close();await start();
 assert.ok((await call('/api/state',undefined,owner.token)).body.approvals.some(c=>c.id===incoming.id));
 assert.equal((await call('/api/approvals',body,owner.token)).status,200);assert.equal((await call('/api/approvals',body,owner.token)).status,409);
 const j=(await call('/api/jobs',{propertyId:p,start:new Date(t+2*86400000).toISOString(),end:new Date(t+2*86400000+3600000).toISOString(),fee:3000,description:'Timer test'},owner.token)).body.id;
 assert.equal((await call('/api/jobs/'+j,{action:'apply'},worker.token)).status,200);
 let card=(await call('/api/state',undefined,owner.token)).body.approvals.find(c=>c.kind==='application'&&c.entityId===j);
 assert.equal((await call('/api/approvals',{id:card.id,revision:card.revision,action:'accept'},owner.token)).status,200);
 app.db.raw.prepare('UPDATE cleaning_jobs SET start=unixepoch()-60,end=unixepoch()+1200 WHERE id=?').run(j);
 assert.equal((await call('/api/jobs/'+j,{action:'start'},worker.token)).status,200);
 const started=(await call('/api/state',undefined,worker.token)).body.jobs.find(v=>v.id===j).started_at;assert.ok(started);
 await app.close();await start();assert.equal((await call('/api/state',undefined,worker.token)).body.jobs.find(v=>v.id===j).started_at,started);
 const report={action:'submit',checklist:[true,true,true,true],report:'Completed test report'};
 assert.equal((await call('/api/jobs/'+j,report,worker.token)).status,200);
 card=(await call('/api/state',undefined,owner.token)).body.approvals.find(c=>c.kind==='report'&&c.entityId===j);
 assert.equal((await call('/api/approvals',{id:card.id,revision:card.revision,action:'reject',reason:'Check the kitchen'},owner.token)).status,200);
 assert.equal((await call('/api/jobs/'+j,report,worker.token)).status,200);
 assert.equal((await call('/api/approvals',{id:card.id,revision:card.revision,action:'accept'},owner.token)).status,409);
 card=(await call('/api/state',undefined,owner.token)).body.approvals.find(c=>c.kind==='report'&&c.entityId===j);
 assert.equal((await call('/api/approvals',{id:card.id,revision:card.revision,action:'accept'},owner.token)).status,200);
 const completed=(await call('/api/state',undefined,worker.token)).body.jobs.find(v=>v.id===j);assert.equal(completed.status,'completed');assert.equal(completed.started_at,started);assert.ok(completed.submitted_at);assert.ok(completed.completed_at);
});

test('logout revokes the server session, leaving other accounts connected',async()=>{
  assert.equal((await call('/auth/logout',{},owner.token)).status,200);
  assert.equal((await call('/api/state',undefined,owner.token)).status,401);
  assert.equal((await call('/api/state',undefined,guest.token)).status,200);
});
test('malformed and oversized input cannot silently modify data',async()=>{
  assert.equal((await call('/api/conversation',{messages:[{}]},guest.token,'PUT')).status,400);
  const invalid=await fetch(base+'/api/profile',{method:'POST',headers:{Authorization:'Bearer '+guest.token,'X-Workspace-Role':'guest','Content-Type':'application/json'},body:'{broken'});
  assert.equal(invalid.status,400);
  assert.equal((await call('/api/profile',{name:'x'.repeat(270000)},guest.token)).status,413);
});

test('expired bearer sessions are rejected even if the client claims an owner role',async()=>{
  app.db.raw.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(worker.user.id);
  assert.equal((await call('/api/state',undefined,worker.token)).status,401);
  assert.equal((await call('/api/properties/'+property+'/readiness',{role:'owner',userId:owner.user.id,readiness:'ready'},worker.token)).status,401);
  assert.equal((await call('/api/state',undefined,guest.token)).status,200);
});
