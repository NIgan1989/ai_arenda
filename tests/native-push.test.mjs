import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {manageNativePush,nativePushState,deliverNativePush,validateNativeToken,nativeMessage,EXPO_PUSH_URL,EXPO_RECEIPTS_URL}=await load('native-push');
const {decryptInstructions}=await load('participant-security');
// Push in the phone app (audit «Доставка срочных уведомлений», point 4): everything but the Apple and Firebase keys.
const config={ACCESS_ENCRYPTION_KEY:'test-encryption-key-'.repeat(3)};
const token=(n='a')=>'ExponentPushToken['+n.repeat(22)+']';
function mobile(f,user='guest',suffix='m'){
 f.db.raw.prepare('INSERT OR IGNORE INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(user,'+7777000000'+(user==='guest'?'1':'2'),user,'test-only','test-only',now());
 const hash=user+suffix;f.db.raw.prepare('INSERT INTO auth_mobile_sessions VALUES (?,?,1,?)').run(hash,user,now()+3600);return hash;
}
const expo=(answer,seen=[])=>async(url,init)=>{seen.push({url,body:JSON.parse(init.body)});return Response.json(typeof answer==='function'?answer(url):answer);};
const ok={data:[{status:'ok',id:'ticket-1'}]};
const count=(f,table)=>f.db.raw.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

test('only an Expo token from Android or iPhone is taken',()=>{
 assert.deepEqual(validateNativeToken({token:token(),platform:'ios'}),{token:token(),platform:'ios'});
 for(const bad of ['https://evil.test/x','ExponentPushToken[]','ExponentPushToken[a b]','ExpoPushToken[../../x]'])assert.throws(()=>validateNativeToken({token:bad,platform:'android'}));
 assert.throws(()=>validateNativeToken({token:token(),platform:'web'}));
});

test('the phone token is bound to the app session and role, encrypted, and gone at sign-out',async()=>{
 const f=await fixture();try{
  const hash=mobile(f);
  await assert.rejects(manageNativePush(f.guest,'owner',{action:'register',token:token(),platform:'android'},config,hash),e=>e.status===403);
  await assert.rejects(manageNativePush(f.guest,'guest',{action:'register',token:token(),platform:'android'},config,'web-cookie'),e=>e.status===401);
  await manageNativePush(f.guest,'guest',{action:'register',token:token(),platform:'android'},config,hash);
  const stored=f.db.raw.prepare('SELECT * FROM native_push_devices').get();assert.ok(!stored.ciphertext.includes(token()));
  assert.equal(JSON.parse(await decryptInstructions(stored.ciphertext,config)).token,token());
  assert.deepEqual(await nativePushState(f.guest,'guest',config,hash),{configured:true,enabled:true});
  await f.owner.notify('guest','Только для владельца','only-role','owner').run();assert.equal(count(f,'native_push_deliveries'),0);
  await f.owner.notify('guest','Новое событие','event','guest').run();assert.equal(count(f,'native_push_deliveries'),1);
  // A new token on the same phone replaces the old one, not doubles it.
  await manageNativePush(f.guest,'guest',{action:'register',token:token('b'),platform:'android'},config,hash);assert.equal(count(f,'native_push_devices'),1);
  f.db.raw.prepare('DELETE FROM auth_mobile_sessions WHERE hash=?').run(hash);
  assert.equal(count(f,'native_push_devices'),0);assert.equal(count(f,'native_push_deliveries'),0);
 }finally{f.db.close();}
});

test('a notice goes to Expo once, says what happened and opens its screen; a self-test is limited to once a minute',async()=>{
 const f=await fixture();try{
  const hash=mobile(f);await manageNativePush(f.guest,'guest',{action:'register',token:token(),platform:'ios'},config,hash);
  await f.owner.notify('guest','Владелец подтвердил бронь.','event','guest').run();
  const seen=[];assert.equal((await deliverNativePush(f.db,config,12,expo(ok,seen))).sent,1);
  assert.equal((await deliverNativePush(f.db,config,12,expo(ok,seen))).sent,0);assert.equal(seen.length,1);
  const [message]=seen[0].body;assert.equal(seen[0].url,EXPO_PUSH_URL);assert.equal(message.to,token());assert.equal(message.body,'Владелец подтвердил бронь.');
  assert.equal(message.data.role,'guest');assert.match(message.data.url,/^\/workspace\/guest\//);assert.equal(message.priority,'default');
  await manageNativePush(f.guest,'guest',{action:'test'},config,hash);await assert.rejects(manageNativePush(f.guest,'guest',{action:'test'},config,hash),e=>e.status===429);
  const test=[];assert.equal((await deliverNativePush(f.db,config,12,expo(ok,test))).sent,1);assert.equal(test[0].body[0].body,'Уведомления на этом телефоне работают.');
 }finally{f.db.close();}
});

test('words a participant wrote stay in the app, the lock screen shows the language the person chose',async()=>{
 const message=nativeMessage({role:'cleaner',body:'Доработайте уборку: под диваном пыль',dedupe:'cleaner:revision:j1',lang:'ru'},token(),null,false);
 assert.ok(!message.body.includes('диваном'));
 const en=nativeMessage({role:'guest',lang:'en'},token(),null,false,true);assert.equal(en.body,'Notifications work on this phone.');
 const urgent=nativeMessage({role:'owner',body:'Требует внимания. Гость ждёт',dedupe:'owner:x'},token(),{url:'/workspace/owner/bookings?entity=b1',title:'Бронь · Дом'},true);
 assert.equal(urgent.priority,'high');assert.equal(urgent.channelId,'urgent');assert.equal(urgent.data.url,'/workspace/owner/bookings?entity=b1');
});

test('a removed app forgets the token; missing Apple or Firebase keys do not retry; a busy service retries',async()=>{
 const f=await fixture();try{
  const hash=mobile(f);await manageNativePush(f.guest,'guest',{action:'register',token:token(),platform:'android'},config,hash);
  await f.owner.notify('guest','Событие 1','e1','guest').run();
  assert.equal((await deliverNativePush(f.db,config,12,expo({data:[{status:'error',details:{error:'InvalidCredentials'}}]}))).failed,1);
  assert.deepEqual({...f.db.raw.prepare('SELECT status,last_error FROM native_push_deliveries').get()},{status:'dead',last_error:'credentials_missing'});
  await f.owner.notify('guest','Событие 2','e2','guest').run();
  assert.equal((await deliverNativePush(f.db,config,12,async()=>new Response('',{status:503}))).failed,1);
  assert.equal(f.db.raw.prepare("SELECT status FROM native_push_deliveries WHERE last_error='provider_unavailable'").get().status,'pending');
  f.db.raw.prepare("UPDATE native_push_deliveries SET available_at=0 WHERE status='pending'").run();
  await deliverNativePush(f.db,config,12,expo({data:[{status:'error',details:{error:'DeviceNotRegistered'}}]}));
  assert.equal(count(f,'native_push_devices'),0);
 }finally{f.db.close();}
});

test('a receipt that the app was removed forgets the token later',async()=>{
 const f=await fixture();try{
  const hash=mobile(f);await manageNativePush(f.guest,'guest',{action:'register',token:token(),platform:'android'},config,hash);
  await f.owner.notify('guest','Событие','e','guest').run();await deliverNativePush(f.db,config,12,expo(ok));
  f.db.raw.prepare('UPDATE native_push_deliveries SET sent_at=?').run(now()-1000);
  const seen=[];await deliverNativePush(f.db,config,12,expo(url=>url===EXPO_RECEIPTS_URL?{data:{'ticket-1':{status:'error',details:{error:'DeviceNotRegistered'}}}}:ok,seen));
  assert.equal(seen[0].url,EXPO_RECEIPTS_URL);assert.deepEqual(seen[0].body,{ids:['ticket-1']});assert.equal(count(f,'native_push_devices'),0);
 }finally{f.db.close();}
});

test('quiet hours hold a plain notice; an urgent one goes when the person allows it',async()=>{
 const f=await fixture();try{
  const hash=mobile(f,'owner');await manageNativePush(f.owner,'owner',{action:'register',token:token(),platform:'ios'},config,hash);
  f.db.raw.prepare("INSERT INTO assistant_preferences(user_id,role,settings,updated_at) VALUES ('owner','owner',?,?) ON CONFLICT(user_id,role) DO UPDATE SET settings=excluded.settings").run(JSON.stringify({quietEnabled:true,quietStart:'00:00',quietEnd:'00:00',urgentInQuiet:true}),now());
  await f.owner.notify('owner','Просто новость','plain','owner').run();
  assert.equal((await deliverNativePush(f.db,config,12,expo(ok))).sent,0);
  await f.owner.notify('owner','Требует внимания. Гость не может войти.','urgent','owner').run();
  const seen=[];assert.equal((await deliverNativePush(f.db,config,12,expo(ok,seen))).sent,1);assert.equal(seen[0].body[0].priority,'high');
 }finally{f.db.close();}
});
