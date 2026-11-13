import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {photo} from '../../tests/fixtures/photo.mjs';

test('operations HTTP routes enforce roles, real balances, calendar privacy and signed hooks',async t=>{
 const secret='fixture-webhook-secret-'.repeat(3),app=createApp({maintenance:false,operationsConfig:{SMS_GATEWAY_URL:'',SMS_GATEWAY_TOKEN:'',TELEGRAM_BOT_TOKEN:'',WHATSAPP_GATEWAY_TOKEN:'',PAYMENT_GATEWAY_TOKEN:'',PAYMENT_WEBHOOK_SECRET:secret,DELIVERY_WEBHOOK_SECRET:secret,ACCESS_ENCRYPTION_KEY:'fixture-access-key-'.repeat(3)}});
 await new Promise(done=>app.server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+app.server.address().port;
 async function call(path,body,user,role='owner'){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(user?{Authorization:'Bearer '+user.token,'X-Workspace-Role':role}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
 try{
  const owner=(await call('/auth/register',{login:'operations_owner',password:'fixture-password'})).body,guest=(await call('/auth/register',{login:'operations_guest',password:'fixture-password'})).body;
  for(const [user,roles] of [[owner,['owner','guest']],[guest,['guest']]])assert.equal((await call('/api/profile',{name:roles[0],roles,city:'Павлодар',contact:'fixture'},user)).status,200);
  const property=(await call('/api/properties',{title:'HTTP fixture',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Fixture',price:10000,rooms:1,capacity:2,cleaningMinutes:90},owner)).body.id;
  const policy={expectedVersion:0,dailyPrice:10000,hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'Fixture',autoConfirm:false,autoAssign:false,cleaningFee:3000,cleaningBudget:4000};assert.equal((await call('/api/properties/'+property+'/policy',policy,owner)).status,200);
  const start=Date.now()+86400000,booking=(await call('/api/bookings',{propertyId:property,start:new Date(start).toISOString(),end:new Date(start+7200000).toISOString(),billingMode:'hourly',guests:1,requestKey:'http-booking',acceptTerms:true},guest,'guest')).body.id;
  assert.equal((await call('/api/bookings/'+booking,{action:'confirm',cleaningFee:3000},owner)).status,200);
  await t.test('aggregated state is authenticated, scoped and reports unconfigured providers',async()=>{
   assert.equal((await call('/api/operations/state')).status,401);const state=await call('/api/operations/state',undefined,owner);assert.equal(state.status,200);assert.equal(state.body.providers.kaspi,'not_connected');assert.equal(state.body.configured.telegram,false);assert.equal((await call('/api/operations/state',undefined,guest,'guest')).body.properties.length,0);
   assert.equal((await call('/api/operations/rules',{propertyId:property,expectedVersion:0,autoOffers:true},owner,'guest')).status,403);
  });
  await t.test('process discussion HTTP routes authenticate users and notify only recipients once',async()=>{
   assert.equal((await call('/api/operations/discussion/candidates')).status,401);
   const room=await call('/api/operations/discussion/open',{kind:'booking',entityId:booking,channel:'stay'},guest,'guest');assert.equal(room.status,200);
   assert.equal((await call('/api/operations/discussion/open',{kind:'booking',entityId:booking,channel:'shared'},guest,'guest')).status,403);
   assert.equal((await call('/api/operations/discussion/open',{kind:'booking',entityId:booking,channel:'cleaning'},guest,'guest')).status,403);
   const body={roomId:room.body.roomId,text:'Уточним время встречи',requestKey:'http-discussion'};
   assert.equal((await call('/api/operations/discussion/send',body,guest,'guest')).status,200);
   assert.equal((await call('/api/operations/discussion/send',body,guest,'guest')).status,200);
   const history=await call('/api/operations/discussion/read',{roomId:room.body.roomId},owner);assert.equal(history.status,200);assert.equal(history.body.messages.length,1);assert.equal(history.body.messages[0].body,body.text);
   assert.deepEqual(history.body.room.members.map(m=>m.role).sort(),['guest','owner']);
   assert.equal((await call('/api/operations/discussion/read',{roomId:room.body.roomId},owner,'cleaner')).status,403);
   const notifications=app.db.raw.prepare("SELECT * FROM notifications WHERE dedupe LIKE '%:discussion:%'").all();assert.equal(notifications.length,1);assert.equal(notifications[0].user_id,owner.user.id);assert.ok(notifications[0].body.includes(body.text),'the notice says what was written: it is the push text');
   const image=await call('/api/operations/discussion/send',{roomId:room.body.roomId,photo,replyTo:history.body.messages[0].seq,requestKey:'http-photo'},owner);assert.equal(image.status,200);
   const attachment=await call('/api/operations/discussion/photo',{roomId:room.body.roomId,seq:image.body.seq},guest,'guest');assert.equal(attachment.status,200);assert.match(attachment.body.data,/^data:image\/jpeg;base64,/);
   const inbox=await call('/api/operations/discussion/inbox',undefined,guest,'guest');assert.equal(inbox.body.unread,1);assert.equal(inbox.body.rooms[0].latest.photo,1);
   await call('/api/operations/discussion/read',{roomId:room.body.roomId},guest,'guest');assert.equal((await call('/api/operations/discussion/inbox',undefined,guest,'guest')).body.unread,0);
   const avatar=await call('/api/media',{kind:'avatar',data:photo},owner),profile=(await call('/api/account',undefined,owner)).body.profile;
   assert.equal((await call('/api/profile/edit',{...profile,avatarId:avatar.body.id,workStatus:'available',expectedVersion:profile.profile_version,bio:'Свяжемся по брони',languages:'Русский'},owner)).status,200);
   const identity=(await call('/api/operations/discussion/read',{roomId:room.body.roomId},guest,'guest')).body.room.members.find(m=>m.id===owner.user.id);assert.equal(identity.avatar_id,avatar.body.id);assert.equal(identity.contact,undefined);
   assert.equal((await call('/api/operations/discussion/avatar',{roomId:room.body.roomId,userId:owner.user.id},guest,'guest')).status,200);
   assert.equal((await call('/api/profile/edit',{...profile,avatarId:avatar.body.id,workStatus:'available',expectedVersion:profile.profile_version+1,avatarVisibility:'self',showPresence:false,showReceipts:false},owner)).status,200);
   assert.equal((await call('/api/operations/discussion/avatar',{roomId:room.body.roomId,userId:owner.user.id},guest,'guest')).status,404);
   assert.equal((await call('/api/media/'+avatar.body.id,undefined,guest,'guest')).status,404);
  });
  await t.test('partial finance is idempotent through HTTP and ignores claimed actor',async()=>{
   const body={kind:'payment',bookingId:booking,amount:1000,confirmed:true,note:'Fixture receipt',requestKey:'partial-http',actorId:guest.user.id};const results=await Promise.all([call('/api/operations/finance',body,owner),call('/api/operations/finance',body,owner)]);assert.equal(results[0].status,200);assert.equal(results[1].status,200);assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries WHERE request_key=?').get(body.requestKey).n,1);assert.equal(app.db.raw.prepare('SELECT paid_amount FROM booking_terms WHERE booking_id=?').get(booking).paid_amount,1000);assert.equal((await call('/api/operations/finance',body,guest,'guest')).status,403);
  });
  await t.test('private calendar export contains only busy intervals and revocation works',async()=>{
   const result=await call('/api/operations/calendar/export',{propertyId:property},owner);assert.equal(result.status,200);const response=await fetch(base+result.body.url),ics=await response.text();assert.equal(response.status,200);assert.match(ics,/BEGIN:VCALENDAR/);assert.ok(!ics.includes('PRIVATE ADDRESS'));assert.ok(!ics.includes('HTTP fixture'));await call('/api/operations/calendar/revoke',{propertyId:property},owner);assert.equal((await fetch(base+result.body.url)).status,404);
  });
  await t.test('unconnected payment and contact providers never create pretend success',async()=>{
   assert.equal((await call('/api/operations/payment-intent',{bookingId:booking,kind:'payment',requestKey:'unconfigured'},guest,'guest')).status,503);assert.equal((await call('/api/operations/phone/request',{},guest,'guest')).status,503);assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM payment_intents').get().n,0);
  });
  await t.test('public hooks require fresh valid signatures and reject unknown signed receipts',async()=>{
   assert.equal((await call('/api/hooks/payment',{eventId:'forged'})).status,403);assert.equal((await call('/api/hooks/delivery',{eventId:'forged'})).status,403);
   const raw=JSON.stringify({channel:'whatsapp',eventId:'unknown',outboxId:'missing',status:'read'}),stamp=String(Math.floor(Date.now()/1000));const signature=createHmac('sha256',secret).update(stamp+'.'+raw).digest('hex');const response=await fetch(base+'/api/hooks/delivery',{method:'POST',headers:{'Content-Type':'application/json','X-Event-Timestamp':stamp,'X-Event-Signature':signature},body:raw});assert.equal(response.status,409);
  });
  await t.test('oversized imports are rejected without creating a source',async()=>{
   const result=await call('/api/operations/calendar/source',{propertyId:property,label:'Oversized',ics:'x'.repeat(701000)},owner);assert.equal(result.status,413);assert.equal(app.db.raw.prepare('SELECT COUNT(*) n FROM calendar_sources').get().n,0);
  });
 }finally{await app.close();}
});
