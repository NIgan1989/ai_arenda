import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateVAPIDKeys} from 'web-push';
import {createECDH,randomBytes} from 'node:crypto';
import {fixture,load,now} from './helpers/platform.mjs';
const {manageWebPush,webPushState,validatePushSubscription,deliverWebPush,pushPayload}=await load('web-push');
const {decryptInstructions}=await load('participant-security');
const {isolateTestConfig}=await load('test-environment');
const vapid=generateVAPIDKeys(),config={VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'https://rental.example.test',ACCESS_ENCRYPTION_KEY:'test-encryption-key-'.repeat(3)};
const device=()=>{const curve=createECDH('prime256v1');curve.generateKeys();return {endpoint:'https://fcm.googleapis.com/fcm/send/'+randomBytes(16).toString('hex'),keys:{auth:randomBytes(16).toString('base64url'),p256dh:curve.getPublicKey().toString('base64url')}};};
function session(f,user='guest',suffix='a'){
 f.db.raw.prepare('INSERT OR IGNORE INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(user,'+7777000000'+(user==='guest'?'1':'2'),user,'test-only','test-only',now());
 const hash=user+suffix;f.db.raw.prepare('INSERT INTO auth_sessions VALUES (?,?,1,?)').run(hash,user,now()+3600);return hash;
}
test('push endpoints reject SSRF, credentials, malformed keys and lookalike providers',()=>{
 const sub=device();assert.deepEqual(validatePushSubscription(sub),sub);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://localhost/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://evilpush.services.mozilla.com/a','https://fcm.googleapis.com:444/a','https://user@fcm.googleapis.com/a','https://web.push.apple.com/a#token'])assert.throws(()=>validatePushSubscription({...sub,endpoint}));
 assert.throws(()=>validatePushSubscription({...sub,keys:{...sub.keys,auth:'abc'}}));
 assert.equal(isolateTestConfig({TEST_DATA_ONLY:'1',...config}).VAPID_PRIVATE_KEY,undefined);
 assert.ok(!pushPayload('guest').includes('PRIVATE ADDRESS'));
});
test('push opt-in is session-bound, encrypted, isolated by role and revoked on logout',async()=>{
 const f=await fixture();try{
  const hash=session(f),sub=device();await assert.rejects(manageWebPush(f.guest,'owner',{action:'subscribe',subscription:sub},config,hash),e=>e.status===403);
  await assert.rejects(manageWebPush(f.guest,'guest',{action:'subscribe',subscription:sub},config,'wrong'),e=>e.status===401);
  await manageWebPush(f.guest,'guest',{action:'subscribe',subscription:sub},config,hash);
  const stored=f.db.raw.prepare('SELECT * FROM push_subscriptions').get();assert.ok(!stored.ciphertext.includes(sub.endpoint));assert.deepEqual(JSON.parse(await decryptInstructions(stored.ciphertext,config)),sub);
  assert.deepEqual(await webPushState(f.guest,'guest',config,hash),{configured:true,publicKey:vapid.publicKey,enabled:true});
  await f.owner.notify('guest','PRIVATE ADDRESS LOCK CODE','only-role','owner').run();assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0);
  await f.owner.notify('guest','PRIVATE ADDRESS LOCK CODE','event','guest').run();await f.owner.notify('guest','PRIVATE ADDRESS LOCK CODE','event','guest').run();assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,1);
  f.db.raw.prepare('DELETE FROM auth_sessions WHERE hash=?').run(hash);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM push_deliveries').get().n,0);
 }finally{f.db.close();}
});
test('push uses encrypted VAPID requests, sends once, rate-limits self tests and retries temporary failures',async()=>{
 const f=await fixture();try{
  const hash=session(f),sub=device();await manageWebPush(f.guest,'guest',{action:'subscribe',subscription:sub},config,hash);
  await manageWebPush(f.guest,'guest',{action:'test'},config,hash);await assert.rejects(manageWebPush(f.guest,'guest',{action:'test'},config,hash),e=>e.status===429);
  let calls=0;const transport=async(url,req)=>{calls++;assert.equal(url,sub.endpoint);assert.equal(req.redirect,'manual');assert.match(req.headers.Authorization||req.headers.authorization,/vapid /);assert.equal(req.headers['Content-Encoding']||req.headers['content-encoding'],'aes128gcm');assert.ok(!Buffer.from(req.body).toString().includes('Уведомления'));return new Response('',{status:201});};
  assert.equal((await deliverWebPush(f.db,config,12,transport)).sent,1);assert.equal((await deliverWebPush(f.db,config,12,transport)).sent,0);assert.equal(calls,1);
  await f.owner.notify('guest','PRIVATE ADDRESS','retry','guest').run();assert.equal((await deliverWebPush(f.db,config,12,async()=>new Response('',{status:503}))).failed,1);
  const pending=f.db.raw.prepare("SELECT * FROM push_deliveries WHERE status='pending'").get();assert.equal(pending.attempts,1);assert.ok(pending.available_at>now());assert.equal(pending.last_error,'provider_unavailable');
  f.db.raw.prepare("UPDATE push_deliveries SET status='sending',lease_until=0 WHERE id=?").run(pending.id);assert.equal((await deliverWebPush(f.db,config,12,transport)).sent,1);
  await f.owner.notify('guest','Remove expired device','gone','guest').run();await deliverWebPush(f.db,config,12,async()=>new Response('',{status:410}));assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
 }finally{f.db.close();}
});
test('expired/changed credentials cannot send, quiet hours defer notifications and disconnect cancels pending deliveries',async()=>{
 const f=await fixture();try{
  const hash=session(f);await manageWebPush(f.guest,'guest',{action:'subscribe',subscription:device()},config,hash);
  await f.owner.notify('guest','Event','quiet','guest').run();
  // Entire current minute is quiet regardless of test timezone.
  const minute=(new Date().getUTCHours()*60+new Date().getUTCMinutes()+300)%1440,start=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),endMinute=(minute+5)%1440,end=String(Math.floor(endMinute/60)).padStart(2,'0')+':'+String(endMinute%60).padStart(2,'0');
  f.db.raw.prepare('INSERT INTO assistant_preferences(user_id,role,settings,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,role) DO UPDATE SET settings=excluded.settings').run('guest','guest',JSON.stringify({quietEnabled:true,quietStart:start,quietEnd:end}),now());
  let calls=0;await deliverWebPush(f.db,config,12,async()=>{calls++;return new Response('',{status:201});});assert.equal(calls,0);
  f.db.raw.prepare('UPDATE auth_accounts SET credential_version=2 WHERE id=?').run('guest');await deliverWebPush(f.db,config,12,async()=>{throw Error('must not call');});assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,0);
 }finally{f.db.close();}
});
