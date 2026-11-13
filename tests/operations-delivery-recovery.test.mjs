import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';import {resolve,join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {fixture,load,now,iso} from './helpers/platform.mjs';
import {createLocalBackup,restoreLocalBackup} from '../scripts/local-backup.mjs';
const {createTelegramLink,acceptTelegramLink,telegramStatus,deliverOutbox,setDeliveryChannel,acceptDeliveryReceipt}=await load('delivery');
const {enqueueJob,runBackgroundJobs,retryBackgroundJob}=await load('background');
test('Telegram binding needs a private signed start event; delivery is opt-in, redacted and deduplicated',async()=>{
 const f=await fixture(),fetch=globalThis.fetch,config={TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_BOT_USERNAME:'rental_test_bot',TELEGRAM_WEBHOOK_SECRET:'test-webhook-secret',SITE_PUBLIC_URL:'https://rental.example.test'};try{
  const replies=[];globalThis.fetch=async(_url,request)=>{replies.push(JSON.parse(request.body));return Response.json({ok:true,result:{}});};
  const link=await createTelegramLink(f.guest,'guest',config),token=new URL(link.url).searchParams.get('start'),event={message:{text:'/start '+token,chat:{type:'private',id:123},from:{id:123,is_bot:false}}};
  await assert.rejects(acceptTelegramLink(f.db,event,'wrong',config),e=>e.status===403);assert.equal((await acceptTelegramLink(f.db,{message:{...event.message,chat:{type:'group',id:123}}},config.TELEGRAM_WEBHOOK_SECRET,config)).ignored,true);
  await acceptTelegramLink(f.db,event,config.TELEGRAM_WEBHOOK_SECRET,config);
  // The bot confirms in the chat; a stale link or a plain /start gets directions instead.
  assert.match(replies.at(-1).text,/Готово/);assert.equal(replies.at(-1).chat_id,123);
  await acceptTelegramLink(f.db,event,config.TELEGRAM_WEBHOOK_SECRET,config);assert.match(replies.at(-1).text,/устарела/);
  await acceptTelegramLink(f.db,{message:{...event.message,text:'/start'}},config.TELEGRAM_WEBHOOK_SECRET,config);assert.match(replies.at(-1).text,/Подключить/);
  const linked=await telegramStatus(f.guest,'guest',config);assert.deepEqual({...linked,linkedAt:linked.linkedAt>0},{configured:true,linked:true,enabled:true,linkedAt:true});assert.deepEqual(await telegramStatus(f.owner,'owner',config),{configured:true,linked:false,enabled:false,linkedAt:0});assert.equal((await telegramStatus(f.guest,'guest',{})).configured,false);
  await f.owner.notify('guest','PRIVATE ADDRESS AND LOCK CODE','test-notice','guest').run();
  let calls=0;globalThis.fetch=async(_url,request)=>{calls++;const body=JSON.parse(request.body);assert.equal(body.chat_id,'123');assert.ok(!body.text.includes('PRIVATE ADDRESS'));assert.ok(!body.text.includes('LOCK CODE'));return Response.json({ok:true,result:{message_id:5}});};
  assert.equal((await deliverOutbox(f.db,config)).sent,1);assert.equal((await deliverOutbox(f.db,config)).sent,0);assert.equal(calls,1);
  await setDeliveryChannel(f.guest,'guest',{channel:'telegram',enabled:false},config);await f.owner.notify('guest','Another event','another-notice','guest').run();assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM delivery_outbox').get().n,1);
 }finally{globalThis.fetch=fetch;f.db.close();}
});
test('durable jobs retry failures, recover expired leases and do not repeat an idempotent domain effect',async()=>{
 const f=await fixture();try{
  await enqueueJob(f.db,'one','test','owner',{},0);let calls=0;const fail=async()=>{calls++;throw Error('temporary');};await runBackgroundJobs(f.db,fail);assert.equal(f.db.raw.prepare('SELECT status FROM background_jobs').get().status,'pending');
  f.db.raw.prepare('UPDATE background_jobs SET available_at=0').run();
  const body={propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,description:'Recovery test',requestKey:'durable-one'};
  await f.owner.createJob(body);f.db.raw.prepare("UPDATE background_jobs SET status='running',lease_until=0").run();await runBackgroundJobs(f.db,()=>f.owner.createJob(body));assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,2);assert.equal(f.db.raw.prepare('SELECT status FROM background_jobs').get().status,'done');
  f.db.raw.prepare("UPDATE background_jobs SET status='dead'").run();await assert.rejects(retryBackgroundJob(f.other,{id:'one'}),e=>e.status===403);await retryBackgroundJob(f.owner,{id:'one'});assert.equal(f.db.raw.prepare('SELECT status FROM background_jobs').get().status,'pending');
 }finally{f.db.close();}
});
test('encrypted local snapshots restore a consistent new database and reject tampering or overwrites',async()=>{
 const root=mkdtempSync(resolve('outputs/recovery-test-')),filename=join(root,'source.sqlite'),secret='fixture-backup-key-'.repeat(4),db=new DatabaseSync(filename);db.exec('CREATE TABLE proof(id TEXT PRIMARY KEY,value TEXT);');db.prepare('INSERT INTO proof VALUES (?,?)').run('one','private test value');db.close();
 const saved=await createLocalBackup({root,filename,secret,force:true}),target=join(root,'restored.sqlite');assert.equal(restoreLocalBackup({root,file:saved.file,target,secret}).integrity,'ok');const restored=new DatabaseSync(target,{readOnly:true});assert.equal(restored.prepare('SELECT value FROM proof').get().value,'private test value');restored.close();
 assert.throws(()=>restoreLocalBackup({root,file:saved.file,target,secret}),/already exists/);assert.throws(()=>restoreLocalBackup({root,file:saved.file,target:join(root,'bad.sqlite'),secret:'wrong-key-'.repeat(8)}));assert.equal(existsSync(join(root,'bad.sqlite')),false);
});

test('a bounded queue pass processes twelve of two hundred jobs and resumes without duplication',async()=>{
 const f=await fixture();try{for(let i=0;i<200;i++)await enqueueJob(f.db,'load-'+String(i).padStart(3,'0'),'fixture','owner');const seen=new Set();const handler=async job=>{assert.ok(!seen.has(job.id));seen.add(job.id);};assert.equal((await runBackgroundJobs(f.db,handler)).completed,12);assert.equal(seen.size,12);for(let i=0;i<16;i++)await runBackgroundJobs(f.db,handler);assert.equal(seen.size,200);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM background_jobs WHERE status='done'").get().n,200);}finally{f.db.close();}
});

test('delivery acceptance and actual read receipts are separate and receipt replay is checked',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("INSERT INTO delivery_channels VALUES ('guest','guest','whatsapp','+77770000000',1,?,?)").run(now(),now());await f.owner.notify('guest','Notice','receipt-fixture','guest').run();const item=f.db.raw.prepare('SELECT id FROM delivery_outbox').get();f.db.raw.prepare("UPDATE delivery_outbox SET status='sent',sent_at=? WHERE id=?").run(now(),item.id);
  assert.equal(f.db.raw.prepare('SELECT read_at FROM delivery_outbox').get().read_at,null);
  const raw=JSON.stringify({channel:'whatsapp',eventId:'receipt-1',outboxId:item.id,status:'read'});await acceptDeliveryReceipt(f.db,raw);assert.equal((await acceptDeliveryReceipt(f.db,raw)).duplicate,true);assert.ok(f.db.raw.prepare('SELECT read_at,delivered_at FROM delivery_outbox').get().read_at);await assert.rejects(acceptDeliveryReceipt(f.db,raw.replace('"read"','"failed"')),e=>e.status===409);
 }finally{f.db.close();}
});
