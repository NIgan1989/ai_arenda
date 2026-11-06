import {test} from 'node:test';import assert from 'node:assert/strict';import {TestDatabase,load} from './helpers/platform.mjs';
const {authRequest,sessionUser}=await load('native-auth'),{RentalService}=await load('service'),{clientConversation}=await load('client-conversation'),{accountSessions}=await load('account-sessions');
const user={name:'Shared account',phone:'+77771110000',password:'fixture-password'};

test('recovery cleanup cannot revoke a concurrent login using the new credential version',async()=>{
 const db=new TestDatabase();try{
  const r=await authRequest(db,request('register',user),'register'),{recoveryCode}=await r.json();
  const {digest}=await load('native-auth'),webToken='a'.repeat(64),mobileToken='b'.repeat(64),webHash=await digest(webToken),mobileHash=await digest(mobileToken),prepare=db.prepare.bind(db);let inserted=false;
  db.prepare=sql=>{const statement=prepare(sql),run=statement.run.bind(statement);statement.run=async()=>{
   if(!inserted&&sql.startsWith('DELETE FROM auth_sessions WHERE user_id=')){inserted=true;const a=db.raw.prepare('SELECT id,credential_version FROM auth_accounts').get();assert.equal(a.credential_version,2);for(const [table,hash] of [['auth_sessions',webHash],['auth_mobile_sessions',mobileHash]])db.raw.prepare(`INSERT INTO ${table} VALUES (?,?,?,?)`).run(hash,a.id,a.credential_version,Math.floor(Date.now()/1000)+3600);}
   return run();};return statement;};
  await authRequest(db,request('recover',{...user,password:'new-fixture-password',recoveryCode}),'recover');assert.ok(inserted);assert.ok(await sessionUser(db,'arenda_session='+webToken));assert.ok(await sessionUser(db,null,'Bearer '+mobileToken));
 }finally{db.close();}
});
function request(action,body={},headers={},client='web'){return new Request('http://localhost/api/'+(client==='mobile'?'mobile/':'')+'auth/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(client==='web'?{origin:'http://localhost'}:{}),...headers},body:JSON.stringify(body)});}
test('web and mobile use one identity but tokens cannot substitute for cookies; recovery revokes both',async()=>{
 const db=new TestDatabase();try{
  const registered=await authRequest(db,request('register',user),'register'),cookie=registered.headers.get('set-cookie'),{recoveryCode}=await registered.json();
  const mobile=await authRequest(db,request('login',user,{},'mobile'),'login','mobile'),{token}=await mobile.json();assert.equal(mobile.headers.get('set-cookie'),null);
  const webUser=await sessionUser(db,cookie),mobileUser=await sessionUser(db,null,'Bearer '+token);assert.equal(webUser.userId,mobileUser.userId);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,1);
  assert.equal(await sessionUser(db,'arenda_session='+token),null);assert.equal(await sessionUser(db,cookie,'Bearer invalid'),null);
  const service=new RentalService(db,mobileUser.userId);await service.connectRole('owner',{});assert.ok(JSON.parse((await new RentalService(db,webUser.userId).profile()).roles).includes('owner'));
  await authRequest(db,request('recover',{...user,password:'new-fixture-password',recoveryCode}),'recover');assert.equal(await sessionUser(db,cookie),null);assert.equal(await sessionUser(db,null,'Bearer '+token),null);
 }finally{db.close();}
});
test('mobile logout and scoped revocation cannot revoke a different user or silently fall back to a cookie',async()=>{
 const db=new TestDatabase();try{
  const registered=await authRequest(db,request('register',user),'register'),cookie=registered.headers.get('set-cookie'),id=(await sessionUser(db,cookie)).userId,s=new RentalService(db,id);
  const mobile=await authRequest(db,request('login',user,{},'mobile'),'login','mobile'),{token}=await mobile.json();
  const req=new Request('http://localhost/api/sessions',{headers:{cookie}}),state=await accountSessions(s,req);assert.equal(state.sessions.length,2);assert.equal(state.sessions.filter(r=>r.current).length,1);
  const foreign=new RentalService(db,'foreign');await assert.rejects(accountSessions(foreign,req,{action:'one',kind:'mobile',id:state.sessions.find(r=>!r.current).id,confirmed:true}),e=>e.status===404);
  await assert.rejects(accountSessions(s,req,{action:'others'}));await accountSessions(s,req,{action:'others',confirmed:true});assert.equal(await sessionUser(db,null,'Bearer '+token),null);assert.ok(await sessionUser(db,cookie));
  const again=await authRequest(db,request('login',user,{},'mobile'),'login','mobile'),next=(await again.json()).token;await authRequest(db,request('logout',{}, {Authorization:'Bearer '+next},'mobile'),'logout','mobile');assert.equal(await sessionUser(db,null,'Bearer '+next),null);assert.ok(await sessionUser(db,cookie));
 }finally{db.close();}
});
test('mobile auth rejects cross-site and oversized bodies; conversation state cannot expand rights or execute actions',async()=>{
 const db=new TestDatabase();try{
  await assert.rejects(authRequest(db,request('register',user,{origin:'https://foreign.test'},'mobile'),'register','mobile'),e=>e.status===403);
  await assert.rejects(authRequest(db,request('register',{...user,padding:'x'.repeat(5000)},{},'mobile'),'register','mobile'),e=>e.status===413);
  const r=await authRequest(db,request('register',user,{},'mobile'),'register','mobile'),{token}=await r.json(),id=(await sessionUser(db,null,'Bearer '+token)).userId,s=new RentalService(db,id);
  await clientConversation(s,'guest',{messages:[{id:'one',sender:'assistant',text:'Бронь создана.'}],flow:null,actor:'owner'});assert.equal((await clientConversation(s,'guest')).actor,'guest');assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
  await assert.rejects(clientConversation(s,'owner'),e=>e.status===403);await assert.rejects(clientConversation(s,'guest',{messages:[],flow:{role:'owner'}}),e=>e.status===403);
  await s.connectRole('owner',{});assert.equal((await clientConversation(s,'owner')).messages.length,0);
 }finally{db.close();}
});
