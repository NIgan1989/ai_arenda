import {test} from 'node:test';import assert from 'node:assert/strict';import {generateVAPIDKeys} from 'web-push';import {createECDH,randomBytes} from 'node:crypto';
import {fixture,load,now,iso} from './helpers/platform.mjs';
// Audit 2026-11-22 «Доставка срочных уведомлений»: a stale request never leaves, one rule of urgency for every
// channel, a lost Telegram answer is retried once at most, «Открыть» leads to the card.
const {deliverOutbox,createTelegramLink,acceptTelegramLink}=await load('delivery');
const {manageWebPush,deliverWebPush}=await load('web-push');
const {staleAction,urgentNotice}=await load('notice-stale');
const tgConfig={TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_BOT_USERNAME:'rental_test_bot',TELEGRAM_WEBHOOK_SECRET:'test-webhook-secret',SITE_PUBLIC_URL:'https://rental.example.test'};
const vapid=generateVAPIDKeys(),pushConfig={VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'https://rental.example.test',ACCESS_ENCRYPTION_KEY:'test-encryption-key-'.repeat(3)};
const device=()=>{const c=createECDH('prime256v1');c.generateKeys();return {endpoint:'https://fcm.googleapis.com/fcm/send/'+randomBytes(16).toString('hex'),keys:{auth:randomBytes(16).toString('base64url'),p256dh:c.getPublicKey().toString('base64url')}};};
async function telegram(f){
 const {RentalService}=await load('service'),serviceFor=id=>new RentalService(f.db,id);
 globalThis.fetch=async()=>Response.json({ok:true,result:{message_id:1}});
 const link=await createTelegramLink(f.owner,'owner',tgConfig);await acceptTelegramLink(f.db,{message:{text:'/start '+new URL(link.url).searchParams.get('start'),chat:{type:'private',id:555},from:{id:555,is_bot:false}}},tgConfig.TELEGRAM_WEBHOOK_SECRET,tgConfig,serviceFor);
 return serviceFor;
}
const request=(f,key,day=1)=>f.guest.createBooking({propertyId:f.property,start:iso(now()+day*86400),end:iso(now()+day*86400+7200),guests:1,billingMode:'hourly',requestKey:key,acceptTerms:true});

test('a request cancelled before the queue ran: the owner gets only the cancellation',async()=>{
 const f=await fixture(),fetch=globalThis.fetch;try{
  const serviceFor=await telegram(f),booking=(await request(f,'cancel-first')).id;
  const asked=f.db.raw.prepare('SELECT body FROM notifications WHERE dedupe=?').get('owner:booking:'+booking).body;
  assert.equal(await staleAction(f.db,'owner:booking:'+booking,now(),asked),false);
  await f.guest.bookingAction(booking,{action:'cancel'});
  assert.equal(await staleAction(f.db,'owner:booking:'+booking,now(),asked),true);
  const texts=[];globalThis.fetch=async(url,r)=>{texts.push(JSON.parse(r.body).text);return Response.json({ok:true,result:{message_id:2}});};
  await deliverOutbox(f.db,tgConfig,30,serviceFor);
  assert.ok(!texts.some(t=>/Новая заявка|Подтвердите/.test(t)),'no request to confirm after the cancellation');
  assert.equal(f.db.raw.prepare("SELECT o.status,o.last_error FROM delivery_outbox o JOIN notifications n ON n.id=o.notification_id WHERE n.dedupe=?").get('owner:booking:'+booking).last_error,'stale');
  // The notice itself stays in the service's own feed.
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM notifications WHERE dedupe=?').get('owner:booking:'+booking).n,1);
 }finally{globalThis.fetch=fetch;f.db.close();}
});

test('a request that expired or was answered in the app is not sent either',async()=>{
 const f=await fixture();try{
  const answered=(await request(f,'answered')).id;await f.owner.bookingAction(answered,{action:'confirm',cleaningFee:3000});
  const ask='Новая заявка на «Test». Подтвердите её в течение 15 мин.';
  assert.equal(await staleAction(f.db,'owner:booking:'+answered,now(),ask),true);
  // The autopilot's report of a confirmation it made carries the same key and is not a request: it still goes out.
  assert.equal(await staleAction(f.db,'owner:booking:'+answered,now(),'ИИ-администратор принял бронь на «Test» по вашим правилам.'),false);
  const expired=(await request(f,'expired',3)).id;
  f.db.raw.prepare('UPDATE bookings SET expires_at=? WHERE id=?').run(now()-1,expired);
  assert.equal(await staleAction(f.db,'owner:booking:'+expired,now(),ask),true);
  // An application stays actionable until the cleaning window ends, not only until it starts.
  const job=f.job.id||f.job;await f.cleaner.jobAction(job,{action:'apply'});
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()-600,now()+3600,job);
  assert.equal(await staleAction(f.db,'owner:application:'+job+':cleaner'),false);
  f.db.raw.prepare('UPDATE cleaning_jobs SET end=? WHERE id=?').run(now()-1,job);
  assert.equal(await staleAction(f.db,'owner:application:'+job+':cleaner'),true);
  assert.equal(await staleAction(f.db,'owner:checkin-reported:'+expired),false,'a notice that asks nothing is never stale');
 }finally{f.db.close();}
});

test('an urgent notice in the quiet hours goes to the browser at once when the owner allows it',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('INSERT OR IGNORE INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run('owner','+77770000002','owner','x','x',now());
  f.db.raw.prepare('INSERT INTO auth_sessions VALUES (?,?,1,?)').run('owner-s','owner',now()+3600);
  await manageWebPush(f.owner,'owner',{action:'subscribe',subscription:device()},pushConfig,'owner-s');
  const quiet=allow=>f.db.raw.prepare('INSERT OR REPLACE INTO assistant_preferences VALUES (?,?,?,?,?)').run('owner','owner',JSON.stringify({quietEnabled:true,quietStart:'00:00',quietEnd:'00:00',urgentInQuiet:allow}),1,now());
  quiet(true);
  await f.owner.notify('owner','Требует внимания. Проверьте заезд гостя.','overdue:x1','owner').run();
  await f.owner.notify('owner','Гость оставил отзыв.','review:x1','owner').run();
  const seen=[];const transport=async(url,req)=>{seen.push(req.headers.Urgency||req.headers.urgency);return new Response('',{status:201});};
  assert.equal((await deliverWebPush(f.db,pushConfig,12,transport)).sent,1);assert.deepEqual(seen,['high']);
  assert.ok(f.db.raw.prepare("SELECT available_at FROM push_deliveries WHERE status='pending'").get().available_at>now(),'the ordinary one waits');
  quiet(false);await f.owner.notify('owner','Требует внимания. Ещё одна проверка.','overdue:x2','owner').run();
  assert.equal((await deliverWebPush(f.db,pushConfig,12,transport)).sent,0,'without the permission it waits too');
  assert.equal(urgentNotice('owner:overdue:1',''),true);assert.equal(urgentNotice('owner:review:1','Спасибо'),false);
 }finally{f.db.close();}
});

test('a lost Telegram answer is retried once at most',async()=>{
 const f=await fixture(),fetch=globalThis.fetch;try{
  const serviceFor=await telegram(f);await f.owner.notify('owner','Гость оставил отзыв.','review:y1','owner').run();
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('The operation was aborted due to timeout');};
  const row=()=>f.db.raw.prepare("SELECT o.status,o.last_error FROM delivery_outbox o JOIN notifications n ON n.id=o.notification_id WHERE n.dedupe='owner:review:y1'").get();
  await deliverOutbox(f.db,tgConfig,30,serviceFor);assert.deepEqual({...row()},{status:'pending',last_error:'outcome_unknown'});
  f.db.raw.prepare('UPDATE delivery_outbox SET available_at=0').run();await deliverOutbox(f.db,tgConfig,30,serviceFor);
  assert.deepEqual({...row()},{status:'dead',last_error:'outcome_unknown'});
  f.db.raw.prepare('UPDATE delivery_outbox SET available_at=0').run();await deliverOutbox(f.db,tgConfig,30,serviceFor);
  assert.equal(calls,2,'two attempts, never more');
 }finally{globalThis.fetch=fetch;f.db.close();}
});
