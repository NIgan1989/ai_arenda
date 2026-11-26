import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {isoCBOR} from '@simplewebauthn/server/helpers';

// Sign-in with Face ID or a fingerprint (lib/passkeys.ts): a phone is played by a P-256 key made here, signing the way
// iCloud Keychain and Google Password Manager do (attestation «none», user verified).
mkdirSync('outputs/passkey-test',{recursive:true});
for(const name of ['domain','request-body','legal-documents','sms','native-auth','app-links','passkeys'])writeFileSync(`outputs/passkey-test/${name}.js`,ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${name}.js'`));
const {authRequest,sessionUser}=await import(pathToFileURL(process.cwd()+'/outputs/passkey-test/native-auth.js'));
const {passkeyRequest,passkeySetup,PASSKEY_RP_ID}=await import(pathToFileURL(process.cwd()+'/outputs/passkey-test/passkeys.js'));
const {appLinksResponse,DEBUG_CERT_SHA256}=await import(pathToFileURL(process.cwd()+'/outputs/passkey-test/app-links.js'));

const b64=bytes=>Buffer.from(bytes).toString('base64url');
const sha=async bytes=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
const uint32=n=>Uint8Array.of(n>>>24&255,n>>>16&255,n>>>8&255,n&255);
// WebCrypto signs P-256 as r||s; WebAuthn carries it as DER.
function der(raw){const int=b=>{let i=0;while(i<b.length-1&&b[i]===0)i++;b=b.slice(i);if(b[0]&0x80)b=join(Uint8Array.of(0),b);return join(Uint8Array.of(2,b.length),b);};const body=join(int(raw.slice(0,32)),int(raw.slice(32)));return join(Uint8Array.of(0x30,body.length),body);}

async function phone({rp=PASSKEY_RP_ID,origin='https://'+PASSKEY_RP_ID}={}){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey),id=crypto.getRandomValues(new Uint8Array(32));let counter=0;
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]));
 const flags=0x01|0x04|0x08|0x10;
 return {
  id:b64(id),origin,
  async create(options){
   const client=new TextEncoder().encode(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin:this.origin,crossOrigin:false}));
   const authData=join(await sha(new TextEncoder().encode(rp)),Uint8Array.of(flags|0x40),uint32(counter),new Uint8Array(16),Uint8Array.of(0,id.length),id,cose);
   return {id:b64(id),rawId:b64(id),type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(client),attestationObject:b64(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',authData]]))),transports:['internal','hybrid']}};
  },
  async get(options,{userHandle}={}){
   const client=new TextEncoder().encode(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin:this.origin,crossOrigin:false}));
   const authData=join(await sha(new TextEncoder().encode(rp)),Uint8Array.of(flags),uint32(counter));
   const signature=der(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,join(authData,await sha(client)))));
   return {id:this.id,rawId:this.id,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(authData),signature:b64(signature),...(userHandle?{userHandle}:{})}};
  },
 };
}

function fixture(config={}){
 const raw=new DatabaseSync(':memory:');
 for(const file of ['0000_boring_unus','0007_native_auth','0027_shared_mobile_api','0052_password_reset','0102_passkeys'])raw.exec(readFileSync(`drizzle/${file}.sql`,'utf8'));
 raw.exec(readFileSync('drizzle/0076_legal_acceptances.sql','utf8').split('CREATE TRIGGER')[0]);
 const db={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return raw.prepare(sql).get(...values)||null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return {meta:{changes:raw.prepare(sql).run(...values).changes}};}};},async batch(statements){raw.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}}};
 const auth=(action,body)=>authRequest(db,new Request('http://localhost/api/mobile/auth/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(action==='register'?{accept:true,...body}:body)}),action,'mobile');
 const call=async(action,body={},token='')=>{const r=await passkeyRequest(db,new Request('http://localhost/api/mobile/auth/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),action,config);return {status:r.status,...await r.json()};};
 return {db,raw,auth,call};
}
const user={name:'Айгерим',phone:'+77771234567',password:'Long password 2026'};

test('a phone turns the passkey on right after the password and then signs in with it alone',async()=>{
 const f=fixture();try{
  const token=(await (await f.auth('register',user)).json()).token,device=await phone();
  const asked=await f.call('passkey-register-options',{},token);
  assert.equal(asked.options.rp.id,PASSKEY_RP_ID);assert.equal(asked.options.user.name,user.phone);assert.equal(asked.options.authenticatorSelection.userVerification,'required');assert.equal(asked.options.authenticatorSelection.residentKey,'required');
  const saved=await f.call('passkey-register',{challengeId:asked.challengeId,response:await device.create(asked.options),device:'iPhone'},token);
  assert.equal(saved.status,201);assert.equal(saved.passkeys.length,1);assert.equal(saved.passkeys[0].device,'iPhone');assert.equal(saved.passkeys[0].synced,true);
  // The same key twice, and a question used twice, are refused.
  await assert.rejects(f.call('passkey-register',{challengeId:asked.challengeId,response:await device.create(asked.options)},token),e=>e.status===409);
  const again=await f.call('passkey-register-options',{},token);
  assert.deepEqual(again.options.excludeCredentials.map(c=>c.id),[device.id]);

  const login=await f.call('passkey-login-options');
  assert.equal(login.options.rpId,PASSKEY_RP_ID);assert.equal(login.options.allowCredentials,undefined);assert.equal(login.options.userVerification,'required');
  const signed=await f.call('passkey-login',{challengeId:login.challengeId,response:await device.get(login.options,{userHandle:b64(new TextEncoder().encode(f.raw.prepare('SELECT id FROM auth_accounts').get().id))})});
  assert.equal(signed.status,200);assert.match(signed.token,/^[a-f0-9]{64}$/);assert.equal(signed.user.phone,user.phone);
  assert.equal((await sessionUser(f.db,null,'Bearer '+signed.token)).phone,user.phone);
  assert.ok(f.raw.prepare('SELECT last_used_at FROM auth_passkeys').get().last_used_at>0);
  // A signature is good for its own question only.
  await assert.rejects(f.call('passkey-login',{challengeId:login.challengeId,response:await device.get(login.options)}),e=>e.status===409);
  const other=await f.call('passkey-login-options');
  await assert.rejects(f.call('passkey-login',{challengeId:other.challengeId,response:await device.get(login.options)}),e=>e.status===401);
 }finally{f.raw.close();}
});

test('another site, another domain, a strange user handle or a stranger key cannot sign in',async()=>{
 const f=fixture();try{
  const token=(await (await f.auth('register',user)).json()).token,device=await phone();
  const asked=await f.call('passkey-register-options',{},token);
  await f.call('passkey-register',{challengeId:asked.challengeId,response:await device.create(asked.options)},token);
  const attempt=async(response)=>{const login=await f.call('passkey-login-options');return f.call('passkey-login',{challengeId:login.challengeId,response:await response(login.options)});};
  device.origin='https://evil.example';await assert.rejects(attempt(o=>device.get(o)),e=>e.status===401);
  device.origin='https://'+PASSKEY_RP_ID;
  const elsewhere=await phone({rp:'evil.example'});elsewhere.id=device.id;await assert.rejects(attempt(o=>elsewhere.get(o)),e=>e.status===401);
  await assert.rejects(attempt(o=>device.get(o,{userHandle:b64(new TextEncoder().encode('someone-else'))})),e=>e.status===401);
  await assert.rejects(attempt(async o=>(await phone()).get(o)),e=>e.status===404);
  // A question asked for sign-in does not add a key, and an add question belongs to its own account.
  const login=await f.call('passkey-login-options');
  await assert.rejects(f.call('passkey-register',{challengeId:login.challengeId,response:await device.create(login.options)},token),e=>e.status===409);
  await assert.rejects(f.call('passkey-register-options'),e=>e.status===401);
  assert.equal((await attempt(o=>device.get(o))).status,200);
 }finally{f.raw.close();}
});

test('the Android app signs as the hash of its certificate',async()=>{
 const setup=passkeySetup();
 assert.deepEqual(setup.origins,['https://'+PASSKEY_RP_ID,'android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w']);
 assert.deepEqual(passkeySetup({PASSKEY_RP_ID:'localhost',PASSKEY_ORIGINS:'http://localhost:8090'}).origins.slice(-1),['http://localhost:8090']);
 const f=fixture();try{
  const token=(await (await f.auth('register',user)).json()).token,device=await phone({origin:setup.origins[1]});
  const asked=await f.call('passkey-register-options',{},token);
  assert.equal((await f.call('passkey-register',{challengeId:asked.challengeId,response:await device.create(asked.options),device:'Android'},token)).status,201);
  const login=await f.call('passkey-login-options');
  assert.equal((await f.call('passkey-login',{challengeId:login.challengeId,response:await device.get(login.options)})).status,200);
 }finally{f.raw.close();}
});

test('a key is added only right after a sign-in or with the password; a password reset removes every key',async()=>{
 const f=fixture();try{
  const token=(await (await f.auth('register',user)).json()).token,device=await phone();
  f.raw.prepare('UPDATE auth_mobile_sessions SET expires_at=expires_at-3600').run();
  await assert.rejects(f.call('passkey-register-options',{},token),e=>e.status===403);
  await assert.rejects(f.call('passkey-register-options',{password:'Wrong password 2026'},token),e=>e.status===401);
  const asked=await f.call('passkey-register-options',{password:user.password},token);
  await f.call('passkey-register',{challengeId:asked.challengeId,response:await device.create(asked.options)},token);
  assert.equal((await f.call('passkey-list',{},token)).passkeys.length,1);

  const removed=await f.call('passkey-remove',{id:device.id},token);assert.deepEqual(removed.passkeys,[]);
  const back=await f.call('passkey-register-options',{password:user.password},token);
  await f.call('passkey-register',{challengeId:back.challengeId,response:await device.create(back.options)},token);
  const id=f.raw.prepare('SELECT id FROM auth_accounts').get().id;
  f.raw.prepare("INSERT INTO auth_reset_codes(user_id,code_hash,attempts,sent_at,expires_at) VALUES (?,?,0,?,?)").run(id,'salt:'+Buffer.from(await sha(new TextEncoder().encode('salt:123456'))).toString('hex'),Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)+600);
  assert.equal((await f.auth('reset',{phone:user.phone,code:'123456',password:'Another password 2026'})).status,200);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM auth_passkeys').get().n,0);
  const login=await f.call('passkey-login-options');
  await assert.rejects(f.call('passkey-login',{challengeId:login.challengeId,response:await device.get(login.options)}),e=>e.status===404&&/выключен/.test(e.message));
 }finally{f.raw.close();}
});

test('a key checked against a session that a password reset ended meanwhile is not kept',async()=>{
 const f=fixture();try{
  const token=(await (await f.auth('register',user)).json()).token,device=await phone();
  const asked=await f.call('passkey-register-options',{},token);
  // The reset lands between the server's session check and the insert of the key.
  const prepare=f.db.prepare.bind(f.db);
  f.db.prepare=sql=>{if(sql.startsWith('INSERT INTO auth_passkeys'))f.raw.prepare('UPDATE auth_accounts SET credential_version=credential_version+1').run();return prepare(sql);};
  await assert.rejects(f.call('passkey-register',{challengeId:asked.challengeId,response:await device.create(asked.options)},token),e=>e.status===401);
  assert.equal(f.raw.prepare('SELECT count(*) n FROM auth_passkeys').get().n,0);
 }finally{f.raw.close();}
});

test('the domain files name the iPhone app by its team and the Android app by its certificate',async()=>{
 const get=(path,config)=>appLinksResponse(new Request('https://'+PASSKEY_RP_ID+path),config);
 assert.equal(get('/.well-known/apple-app-site-association',{}).status,404);
 assert.deepEqual(await get('/.well-known/apple-app-site-association',{APPLE_TEAM_ID:'ab12cd34ef'}).json(),{webcredentials:{apps:['AB12CD34EF.app.aiarenda.assistant']}});
 assert.equal(get('/.well-known/apple-app-site-association',{APPLE_TEAM_ID:'not a team'}).status,404);
 const links=await get('/.well-known/assetlinks.json',{}).json();
 assert.deepEqual(links,[{relation:['delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:'app.aiarenda.assistant',sha256_cert_fingerprints:[DEBUG_CERT_SHA256]}}]);
 assert.equal(get('/api/state',{}),null);
 assert.equal(appLinksResponse(new Request('https://x.dev/.well-known/assetlinks.json',{method:'POST'}),{}),null);
});
