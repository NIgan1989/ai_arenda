import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TestDatabase,load,fixture,now} from './helpers/platform.mjs';
const {RentalService}=await load('service'),{authRequest,sessionUser}=await load('native-auth'),{accountDeletionState,accountDeletionAction}=await load('account-deletion'),{safetyAction}=await load('account-safety');
const password='deletion-fixture-password';
function auth(action,body={},headers={},mobile=false){return new Request('http://localhost/api/'+(mobile?'mobile/':'')+'auth/'+action,{method:'POST',headers:{'content-type':'application/json',...(!mobile?{origin:'http://localhost'}:{}),...headers},body:JSON.stringify(body)});}
async function unused(){const db=new TestDatabase(),body={phone:'+77771112233',name:'Erasure fixture',password},registration=await authRequest(db,auth('register',body),'register'),cookie=registration.headers.get('set-cookie'),user=await sessionUser(db,cookie),s=new RentalService(db,user.userId),login=await authRequest(db,auth('login',body,{},true),'login','mobile'),token=(await login.json()).token;await safetyAction(s,'guest','deletion',{action:'request',confirmed:true});const requestId=(await accountDeletionState(s,'guest')).request.id;return {db,s,cookie,token,requestId,erase:{action:'erase',requestId,password,confirmed:true,confirmation:'УДАЛИТЬ АККАУНТ'}};}

test('unused shared account deletion removes local data and sessions, retaining an unlinked receipt and disclosed opaque fence',async()=>{
 const f=await unused();try{
  const other=await authRequest(f.db,auth('register',{phone:'+77770000001',name:'Other account',password}),'register');const otherUser=await sessionUser(f.db,other.headers.get('set-cookie'));
  f.db.raw.prepare('INSERT INTO profile_preferences VALUES (?,?,?,?,?,?)').run(f.s.userId,'Private bio','Русский','participants',1,1);
  f.db.raw.prepare("INSERT INTO matching_requests(id,guest_id,request_key,filters,status,created_at,expires_at) VALUES (?,?,?,'{\"district\":\"Private search\"}','empty',?,?)").run('unused-match',f.s.userId,'unused-key',now(),now()+600);
  f.db.raw.prepare('INSERT INTO media(id,user_id,kind,data,width,height,bytes,created_at) VALUES (?,?,?,?,?,?,?,?)').run('avatar',f.s.userId,'avatar','private-local-image',8,8,100,now());
  f.db.raw.prepare('INSERT INTO profile_details VALUES (?,?,?,?,?,?)').run(f.s.userId,'avatar','available',1,'revision',now());
  f.db.raw.prepare("INSERT INTO notifications VALUES ('notification',?,'Private notification','unique',0,?)").run(f.s.userId,now());
  f.db.raw.prepare("INSERT INTO delivery_outbox(id,notification_id,user_id,role,channel,status,attempts,available_at,created_at) VALUES ('pending','notification',?,'guest','telegram','pending',0,?,?)").run(f.s.userId,now(),now());
  await f.s.chat({role:'guest',text:'Найди жильё'});
  assert.equal((await accountDeletionState(f.s,'guest')).canEraseActiveDatabase,true);
  const result=await accountDeletionAction(f.s,'guest',f.erase);assert.equal(result.erased,true);assert.equal(result.signOut,true);assert.equal(result.receipt.scope,'active_database_only');
  assert.equal(await sessionUser(f.db,f.cookie),null);assert.equal(await sessionUser(f.db,null,'Bearer '+f.token),null);assert.equal(await f.s.profile(),null);
  for(const table of ['matching_requests','matching_offers','matching_preferences','messages','media','profile_details','profile_preferences','notifications','delivery_outbox','deletion_requests','auth_mobile_sessions'])assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM auth_sessions WHERE user_id=?').get(f.s.userId).n,0);
  assert.ok(await new RentalService(f.db,otherUser.userId).profile());assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,1);
  const receipt=f.db.raw.prepare('SELECT * FROM account_erasure_receipts').get();assert.doesNotMatch(JSON.stringify(receipt),new RegExp(f.s.userId+'|77771112233|Erasure fixture|Private bio'));
  const fence=f.db.raw.prepare('SELECT * FROM account_erasure_fences').get();assert.equal(fence.user_id,f.s.userId);assert.deepEqual(Object.keys(fence).sort(),['erased_at','user_id']);
 }finally{f.db.close();}
});

test('late authorised writes cannot revive an erased UUID, while a new registration with the same phone gets a new identity',async()=>{
 const f=await unused();try{
  const other=await authRequest(f.db,auth('register',{phone:'+77770000001',name:'Other owner',password}),'register'),otherId=(await sessionUser(f.db,other.headers.get('set-cookie'))).userId,owner=new RentalService(f.db,otherId);await owner.connectRole('owner',{});
  const property=(await owner.createProperty({title:'Other property',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Fixture',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;
  await accountDeletionAction(f.s,'guest',f.erase);
  await assert.rejects(f.s.saveProfile({name:'Late revival',contact:'PRIVATE',city:'Павлодар',roles:['guest']}),/account_erased/);
  assert.throws(()=>f.db.raw.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?)').run('late',f.s.userId,'guest','user','Late private text',now()),/account_erased/);
  assert.throws(()=>f.db.raw.prepare('INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('late-booking',property,f.s.userId,now()+100,now()+200,now()+300,1,1000,'requested',now()+100,'unpaid','late',now()),/account_erased/);
  assert.equal(await f.s.profile(),null);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n,0);
  const registration=await authRequest(f.db,auth('register',{phone:'+77771112233',name:'New account',password}),'register'),newUser=await sessionUser(f.db,registration.headers.get('set-cookie'));assert.notEqual(newUser.userId,f.s.userId);assert.ok(await new RentalService(f.db,newUser.userId).profile());
 }finally{f.db.close();}
});

test('explicit confirmation, current request and password are required; password guessing and platform operator removal fail closed',async()=>{
 const f=await unused();try{
  for(const extra of [{confirmed:false},{confirmation:'yes'},{requestId:'other'},{password:'wrong-fixture-password'}])await assert.rejects(accountDeletionAction(f.s,'guest',{...f.erase,...extra}));
  assert.ok(await f.s.profile());assert.ok(await sessionUser(f.db,f.cookie));assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM account_erasure_receipts').get().n,0);
  assert.equal((await accountDeletionState(f.s,'guest',true)).canEraseActiveDatabase,false);await assert.rejects(accountDeletionAction(f.s,'guest',f.erase,true),e=>e.status===409);
  for(let i=0;i<4;i++)await assert.rejects(accountDeletionAction(f.s,'guest',{...f.erase,password:'wrong-fixture-password'}),e=>e.status===401);
  await assert.rejects(accountDeletionAction(f.s,'guest',f.erase),e=>e.status===429);assert.ok(await f.s.profile());
 }finally{f.db.close();}
});

test('active and historical process records block erasure and operator review cannot falsely mark them deleted',async()=>{
 const f=await fixture();try{
  await safetyAction(f.guest,'guest','deletion',{action:'request',confirmed:true});const state=await accountDeletionState(f.guest,'guest');assert.equal(state.canEraseActiveDatabase,false);assert.ok(state.blockers.some(b=>b.code==='bookings'));
  const before=f.db.raw.prepare('SELECT status,payment_status,amount FROM bookings WHERE id=?').get(f.booking);
  await assert.rejects(accountDeletionAction(f.guest,'guest',{action:'erase',requestId:state.request.id,confirmed:true,confirmation:'УДАЛИТЬ АККАУНТ',password}),e=>e.status===409);
  await assert.rejects(accountDeletionAction(f.owner,'owner',{action:'review',requestId:state.request.id,status:'reviewing',note:'Checking records'}),e=>e.status===403);
  const review=await accountDeletionAction(f.owner,'owner',{action:'review',requestId:state.request.id,status:'needs_action',note:'Finish the booking and define retention.'},true);assert.match(review.message,/не выполнялось/);assert.ok((await accountDeletionState(f.guest,'guest')).review);
  await assert.rejects(accountDeletionAction(f.owner,'owner',{action:'review',requestId:state.request.id,status:'erased',note:'Fake success'},true));
  assert.deepEqual(f.db.raw.prepare('SELECT status,payment_status,amount FROM bookings WHERE id=?').get(f.booking),before);
 }finally{f.db.close();}
});

test('unknown table and newly added column stop automatic cleanup instead of losing or overlooking personal data',async()=>{
 const f=await unused();try{
  f.db.raw.exec('CREATE TABLE future_personal_records(user_id TEXT,secret TEXT)');assert.equal((await accountDeletionState(f.s,'guest')).canEraseActiveDatabase,false);await assert.rejects(accountDeletionAction(f.s,'guest',f.erase),e=>e.status===409);
  f.db.raw.exec('DROP TABLE future_personal_records; ALTER TABLE notifications ADD COLUMN private_note TEXT');assert.ok((await accountDeletionState(f.s,'guest')).blockers.some(b=>b.code==='schema_review'));
  await assert.rejects(accountDeletionAction(f.s,'guest',f.erase),e=>e.status===409);assert.ok(await f.s.profile());
 }finally{f.db.close();}
});

test('missing closure fences stop deletion instead of giving a false concurrency guarantee',async()=>{
 const f=await unused();try{
  f.db.raw.exec('DROP TRIGGER account_erased_messages_insert');assert.ok((await accountDeletionState(f.s,'guest')).blockers.some(b=>b.code==='schema_review'));await assert.rejects(accountDeletionAction(f.s,'guest',f.erase),e=>e.status===409);assert.ok(await f.s.profile());
 }finally{f.db.close();}
});

test('all model accounting states block erasure, so deletion cannot refund global spend or token limits',async()=>{
 for(const status of ['reserved','completed','uncertain','rejected']){const f=await unused();try{
  f.db.raw.prepare('INSERT INTO ai_usage_reservations(id,user_id,request_key,day,model,status,reserved_input_tokens,reserved_output_tokens,charged_tokens,charged_cost_micros,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('usage',f.s.userId,'request','2026-10-30','fixture',status,1,1,2,5,now());
  assert.ok((await accountDeletionState(f.s,'guest')).blockers.some(b=>b.code==='model_usage'));await assert.rejects(accountDeletionAction(f.s,'guest',f.erase),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT SUM(charged_cost_micros) amount FROM ai_usage_reservations').get().amount,5);
 }finally{f.db.close();}}
});

test('new related records added after preflight prevent every deletion atomically',async()=>{
 const f=await unused();try{
  const original=f.db.batch.bind(f.db);let injected=false;
  f.db.batch=async statements=>{if(!injected){injected=true;f.db.raw.prepare('INSERT INTO ai_usage_reservations(id,user_id,request_key,day,model,status,reserved_input_tokens,reserved_output_tokens,charged_tokens,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('usage',f.s.userId,'request','2026-10-30','fixture','completed',1,1,2,now());}return original(statements);};
  await assert.rejects(accountDeletionAction(f.s,'guest',f.erase),e=>e.status===409);assert.ok(await f.s.profile());assert.ok(await sessionUser(f.db,f.cookie));assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM account_erasure_receipts').get().n,0);
 }finally{f.db.close();}
});

test('session revocation is available while deletion is blocked and never claims data erasure',async()=>{
 const f=await unused();try{
  await assert.rejects(accountDeletionAction(f.s,'guest',{action:'revoke-sessions'}));const r=await accountDeletionAction(f.s,'guest',{action:'revoke-sessions',confirmed:true,userId:'someone-else'});assert.equal(r.signOut,true);assert.equal(r.erased,undefined);assert.ok(await f.s.profile());assert.equal(await sessionUser(f.db,f.cookie),null);assert.equal(await sessionUser(f.db,null,'Bearer '+f.token),null);
 }finally{f.db.close();}
});

test('operator hold and release reflect the latest review even when both decisions occur in one second',async()=>{
 const f=await unused();try{
  const operator=new RentalService(f.db,'operator');await operator.saveProfile({name:'Operator',roles:['owner'],city:'Павлодар',contact:'Fixture'});
  const hold=await accountDeletionAction(operator,'owner',{action:'review',requestId:f.requestId,status:'needs_action',note:'Check the requested scope.'},true);assert.equal(hold.canEraseActiveDatabase,false);assert.ok((await accountDeletionState(f.s,'guest')).blockers.some(b=>b.code==='operator_hold'));
  const release=await accountDeletionAction(operator,'owner',{action:'review',requestId:f.requestId,status:'reviewing',note:'No active process or retained ledger.'},true);assert.equal(release.canEraseActiveDatabase,true);assert.equal((await accountDeletionState(f.s,'guest')).review.note,'No active process or retained ledger.');
 }finally{f.db.close();}
});

test('preflight and atomic erasure work without compound SELECTs under a D1-style lowered SQL limit',async()=>{
 const f=await unused();try{
  // Node's bundled SQLite currently exposes no sqlite3_limit setter. Rejecting
  // compound SELECTs entirely exercises a stricter bound than the failing D1
  // request, while still executing the real queries and transactional cleanup.
  const original=f.db.prepare.bind(f.db);let checked=0;
  f.db.prepare=sql=>{assert.doesNotMatch(sql,/\b(?:UNION|INTERSECT|EXCEPT)\b/i);checked++;return original(sql);};
  assert.equal((await accountDeletionState(f.s,'guest')).canEraseActiveDatabase,true);
  const result=await accountDeletionAction(f.s,'guest',f.erase);assert.equal(result.erased,true);assert.ok(checked>20);assert.equal(await f.s.profile(),null);
 }finally{f.db.close();}
});
