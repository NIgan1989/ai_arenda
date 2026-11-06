import {test} from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../server/app.mjs';
test('phone web login and native bearer share profiles, roles, state and session revocation over HTTP',async()=>{
 const origins=[],app=createApp({maintenance:false,origins});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+app.server.address().port;origins.push(base);
 const phone={phone:'+77772220000',password:'fixture-password',name:'Shared fixture',city:'Павлодар'};
 async function call(path,body,headers={},method){const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cookie:r.headers.get('set-cookie'),value:await r.json()};}
 try{
  const web=await call('/api/auth/register',phone,{origin:base});assert.equal(web.status,201);const browser={cookie:web.cookie,'X-Workspace-Role':'guest'};
  const login=await call('/api/mobile/auth/login',phone);assert.equal(login.status,200);assert.equal(login.cookie,null);const mobile={Authorization:'Bearer '+login.value.token,'X-Workspace-Role':'guest'};
  const access=await call('/api/access',undefined,mobile),other=await call('/api/access',undefined,browser);assert.equal(access.value.user.id,other.value.user.id);
  assert.equal((await call('/api/state',undefined,mobile)).status,200);assert.equal((await call('/api/state',undefined,{...mobile,'X-Workspace-Role':'owner'})).status,403);
  assert.equal((await call('/api/conversation',{messages:[{id:'one',sender:'user',text:'Draft'}],flow:null},mobile,'PUT')).status,200);assert.equal((await call('/api/conversation',undefined,browser)).value.messages.length,1);
  const sessions=await call('/api/sessions',undefined,browser);assert.equal(sessions.value.sessions.length,2);
  await call('/api/sessions',{action:'others',confirmed:true},browser);assert.equal((await call('/api/access',undefined,mobile)).status,401);assert.equal((await call('/api/access',undefined,browser)).status,200);
 }finally{await app.close();}
});
