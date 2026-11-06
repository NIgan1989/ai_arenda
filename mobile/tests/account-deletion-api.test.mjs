import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';

test('shared mobile erasure with an idempotency key removes prior receipts and never revives the account or either session',async()=>{
 const origins=[],app=createApp({maintenance:false,origins,operationsConfig:{TEST_DATA_ONLY:'1',TEST_AI_ENABLED:'0',OPENAI_API_KEY:'',OPENAI_MODEL:''}});
 await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+app.server.address().port;origins.push(base);
 async function call(path,body,headers={},method){
  const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,cookie:response.headers.get('set-cookie'),value:await response.json()};
 }
 try{
  const credentials={phone:'+77773331111',password:'erasure-http-fixture-password',name:'Unused erasure fixture',city:'Павлодар'};
  const registered=await call('/api/auth/register',credentials,{origin:base});assert.equal(registered.status,201);
  const browser={cookie:registered.cookie.split(';')[0],'X-Workspace-Role':'guest'};
  const login=await call('/api/mobile/auth/login',credentials);assert.equal(login.status,200);
  const mobile={Authorization:'Bearer '+login.value.token,'X-Workspace-Role':'guest'};
  const access=await call('/api/access',undefined,mobile),browserAccess=await call('/api/access',undefined,browser),userId=access.value.user.id;
  assert.equal(access.status,200);assert.equal(browserAccess.status,200);assert.equal(browserAccess.value.user.id,userId);

  // A request made through the idempotency wrapper leaves a prior receipt that
  // the later erasure must remove, rather than merely skipping its own receipt.
  const requested=await call('/api/operations/safety/deletion',{action:'request',confirmed:true},{...mobile,'Idempotency-Key':'request-erasure-http-fixture'});
  assert.equal(requested.status,200);assert.equal(typeof requested.value.id,'string');
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM command_receipts WHERE user_id=?').get(userId).n,1);
  const safety=await call('/api/operations/safety',undefined,mobile);assert.equal(safety.status,200);
  assert.equal(safety.value.deletionDetails.canEraseActiveDatabase,true);assert.deepEqual(safety.value.deletionDetails.blockers,[]);

  const eraseBody={action:'erase',requestId:requested.value.id,confirmed:true,confirmation:'УДАЛИТЬ АККАУНТ',password:credentials.password},eraseHeaders={...mobile,'Idempotency-Key':'erase-unused-http-fixture'};
  const erased=await call('/api/operations/safety/account-deletion',eraseBody,eraseHeaders);
  assert.equal(erased.status,200);assert.equal(erased.value.erased,true);assert.equal(erased.value.signOut,true);assert.equal(erased.value.receipt.scope,'active_database_only');
  assert.equal(typeof erased.value.receipt.id,'string');
  for(const [table,column] of [['profiles','id'],['auth_accounts','id'],['auth_sessions','user_id'],['auth_mobile_sessions','user_id'],['command_receipts','user_id'],['deletion_requests','user_id']]){
   assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM '+table+' WHERE '+column+'=?').get(userId).n,0,table);
  }
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM account_erasure_receipts WHERE id=?').get(erased.value.receipt.id).n,1);
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM account_erasure_fences WHERE user_id=?').get(userId).n,1);
  assert.equal((await call('/api/access',undefined,mobile)).status,401);
  assert.equal((await call('/api/access',undefined,browser)).status,401);

  // Neither replaying the final request nor a stale authenticated profile write
  // may recreate a receipt, profile or valid session after the response.
  assert.equal((await call('/api/operations/safety/account-deletion',eraseBody,eraseHeaders)).status,401);
  assert.equal((await call('/api/profile',{name:'Late profile',contact:'Fixture',city:'Павлодар',roles:['guest']},{...mobile,'Idempotency-Key':'late-profile-http-fixture'})).status,401);
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM profiles WHERE id=?').get(userId).n,0);
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM command_receipts WHERE user_id=?').get(userId).n,0);
  assert.equal((await call('/api/mobile/auth/login',credentials)).status,401);
 }finally{await app.close();}
});
