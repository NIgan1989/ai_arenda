import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../server/app.mjs';
const folder=mkdtempSync(join(tmpdir(),'ai-arenda-api-'));
const filename=join(folder,'test.sqlite');let app,base,owner,guest,worker,property,booking,job;
async function start(){app=createApp({filename,maintenance:false});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+app.server.address().port;}
async function call(path,body,token,method){const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
before(start);
after(async()=>{await app.close();const target=resolve(folder);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('ai-arenda-api-'));rmSync(target,{recursive:true,force:true});});
test('unauthenticated clients cannot read data; CORS rejects unapproved web origins',async()=>{
  assert.equal((await call('/api/state')).status,401);
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
  async function send(input){const response=await fetch(base+'/api/properties',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'application/json','Idempotency-Key':'property-command-1'},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};}
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
test('logout revokes the server session, leaving other accounts connected',async()=>{
  assert.equal((await call('/auth/logout',{},owner.token)).status,200);
  assert.equal((await call('/api/state',undefined,owner.token)).status,401);
  assert.equal((await call('/api/state',undefined,guest.token)).status,200);
});
test('malformed and oversized input cannot silently modify data',async()=>{
  assert.equal((await call('/api/conversation',{messages:[{}]},guest.token,'PUT')).status,400);
  const invalid=await fetch(base+'/api/profile',{method:'POST',headers:{Authorization:'Bearer '+guest.token,'Content-Type':'application/json'},body:'{broken'});
  assert.equal(invalid.status,400);
  assert.equal((await call('/api/profile',{name:'x'.repeat(270000)},guest.token)).status,413);
});
