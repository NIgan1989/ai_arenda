import {test} from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../server/app.mjs';import {photo} from '../../tests/fixtures/photo.mjs';
test('native messenger contract preserves private channels, attachments, replies, blocks and role-scoped AI history',async()=>{
 const original=globalThis.fetch;let modelCalls=0,modelBody='';
 globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.openai.com/v1/responses'){modelCalls++;modelBody=options.body;return Response.json({usage:{input_tokens:80,output_tokens:15},output:[{type:'message',content:[{type:'output_text',text:'Уточните детали с владельцем в личном чате.'}]}]});}return original(url,options);};
 const app=createApp({maintenance:false,operationsConfig:{TEST_DATA_ONLY:'1',TEST_AI_ENABLED:'1',OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'}});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+app.server.address().port;
 async function call(path,body,person,role='guest'){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(person?{Authorization:'Bearer '+person.token,'X-Workspace-Role':role}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,value:await r.json()};}
 async function register(phone,name,roles){const r=await call('/api/mobile/auth/register',{phone,name,password:'fixture-password',city:'Павлодар'});assert.equal(r.status,201);const person=r.value;await call('/api/profile',{name,city:'Павлодар',contact:phone,roles,districts:'Центр',experience:'Fixture',availability:'By agreement'},person,roles.at(-1));return person;}
 try{
  const owner=await register('+77773000001','Owner',['guest','owner']),guest=await register('+77773000002','Guest',['guest']),worker=await register('+77773000003','Cleaner',['guest','cleaner']);
  const property=await call('/api/properties',{title:'Messenger fixture',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Fixture',price:10000,rooms:1,capacity:2,cleaningMinutes:90},owner,'owner');assert.equal(property.status,200);
  const start=Date.now()+86400000,end=start+86400000;
  const booking=await call('/api/bookings',{propertyId:property.value.id,start:new Date(start).toISOString(),end:new Date(end).toISOString(),guests:1,billingMode:'daily',acceptTerms:true,requestKey:'messenger-booking'},guest);assert.equal(booking.status,200);
  const confirmed=await call('/api/bookings/'+booking.value.id,{action:'confirm',cleaningFee:3000},owner,'owner');assert.equal(confirmed.status,200);
  const job=app.db.raw.prepare('SELECT id FROM cleaning_jobs WHERE booking_id=?').get(booking.value.id);app.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=?").run(worker.user.id,job.id);
  const stay=(await call('/api/operations/discussion/open',{kind:'booking',entityId:booking.value.id},guest)).value;
  const cleaning=(await call('/api/operations/discussion/open',{kind:'job',entityId:job.id,channel:'cleaning'},owner,'owner')).value;
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM discussion_messages').get().n,0);
  const posted=await call('/api/operations/discussion/send',{...cleaning,text:'STAFF-PRIVATE-TEXT',photo,requestKey:'photo'},owner,'owner');assert.equal(posted.status,200);
  assert.equal((await call('/api/operations/discussion/send',{...cleaning,text:'STAFF-PRIVATE-TEXT',photo,requestKey:'photo'},owner,'owner')).value.seq,posted.value.seq);
  const privateRead=await call('/api/operations/discussion/read',cleaning,worker,'cleaner');assert.equal(privateRead.value.userId,worker.user.id);assert.equal(privateRead.value.messages[0].photo,1);
  const attachment=(await call('/api/operations/discussion/photo',{...cleaning,seq:posted.value.seq},worker,'cleaner')).value.data;assert.match(attachment,/^data:image\/jpeg;base64,/);assert.ok(attachment.length<=photo.length);
  for(const path of ['read','photo'])assert.equal((await call('/api/operations/discussion/'+path,{...cleaning,seq:posted.value.seq},guest)).status,403);
  assert.equal((await call('/api/operations/discussion/send',{...stay,text:'Foreign reply',replyTo:posted.value.seq,requestKey:'bad-reply'},guest)).status,403);
  const inbox=await call('/api/operations/discussion/inbox',undefined,guest);assert.equal(inbox.value.userId,guest.user.id);assert.equal(inbox.value.rooms.some(r=>r.id===cleaning.roomId),false);assert.doesNotMatch(JSON.stringify(inbox.value),/STAFF-PRIVATE-TEXT|Cleaner/);
  const hello=await call('/api/operations/discussion/send',{...stay,text:'Guest discussion',requestKey:'hello'},guest);assert.equal(hello.status,200);
  await call('/api/operations/safety/block',{...stay,blocked:true},guest);
  assert.equal((await call('/api/operations/discussion/send',{...stay,text:'Blocked',requestKey:'blocked'},owner,'owner')).status,403);
  assert.equal((await call('/api/operations/discussion/read',stay,guest)).value.messages.length,1);
  await call('/api/operations/safety/block',{...stay,blocked:false},guest);
  assert.equal((await call('/api/operations/safety/report',{...stay,kind:'message',targetId:String(hello.value.seq),reason:'Review fixture'},guest)).status,200);
  assert.equal((await call('/api/operations/safety/report',{...cleaning,kind:'message',targetId:String(posted.value.seq),reason:'Foreign material'},guest)).status,403);
  await call('/api/chat',{text:'Как обсудить детали проживания?'},guest);assert.equal(modelCalls,0);
  const permission=(await call('/api/operations/ai-data-permission',undefined,guest)).value.permission;
  await call('/api/operations/ai-data-permission',{allowed:true,expectedVersion:permission.version,policyVersion:permission.policyVersion},guest);
  const answer=await call('/api/chat',{text:'Как обсудить детали проживания?'},guest);assert.equal(answer.value.mode,'model');assert.equal(modelCalls,1);assert.doesNotMatch(modelBody,/STAFF-PRIVATE-TEXT|PRIVATE ADDRESS|data:image\/jpeg/);
  const history=(await call('/api/operations/administrator/conversation',undefined,guest)).value;assert.equal(history.userId,guest.user.id);assert.equal(history.messages.length,4);assert.equal((await call('/api/operations/administrator/conversation',undefined,owner,'owner')).value.messages.length,0);
 }finally{await app.close();globalThis.fetch=original;}
});
