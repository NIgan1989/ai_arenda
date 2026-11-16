import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {enqueueJob,runBackgroundJobs,cloudBackup}=await load('background');
const {decryptInstructions}=await load('participant-security');
const config=()=>{const store=new Map();return {ACCESS_ENCRYPTION_KEY:'fixture-backup-key-'.repeat(4),BUCKET:{async put(key,body){store.set(key,body);}},store};};

test('the service\'s own jobs run before the owners\' ones, however many owners there are',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('DELETE FROM background_jobs').run();
  for(let i=0;i<60;i++)await enqueueJob(f.db,'owner:'+String(i).padStart(3,'0'),'owner','owner-'+i);
  await enqueueJob(f.db,'delivery','delivery','system');await enqueueJob(f.db,'admin-issues','admin-issues','system');
  f.db.raw.prepare("UPDATE background_jobs SET available_at=available_at+1 WHERE scope='system'").run();
  f.db.raw.prepare('UPDATE background_jobs SET available_at=available_at-10').run();
  const seen=[];await runBackgroundJobs(f.db,async job=>{seen.push(job.id);},12);
  assert.deepEqual(seen.slice(0,2).sort(),['admin-issues','delivery']);assert.equal(seen.length,12);
 }finally{f.db.close();}
});

test('a small database is backed up as one object, a big one as numbered parts with every row',async()=>{
 const f=await fixture();try{
  const small=config(),one=await cloudBackup(f.db,small);assert.equal(one.parts,1);assert.match(one.key,/^private-backups\/\d{4}-\d\d-\d\d\.snapshot\.enc$/);
  const whole=JSON.parse(await decryptInstructions(small.store.get(one.key),small));assert.ok(whole.tables.bookings.length>=1);assert.ok('properties' in whole.tables);
  // More rows than one page and more bytes than one part: nothing is lost and nothing throws.
  const add=f.db.raw.prepare('INSERT INTO notifications VALUES (?,?,?,?,0,0)');for(let i=0;i<530;i++)add.run('n'+i,'owner','Сообщение № '+i,'bulk:'+i);
  const total=f.db.raw.prepare('SELECT COUNT(*) n FROM notifications').get().n;
  const big=config(),many=await cloudBackup(f.db,big,100,4000);assert.ok(many.parts>3);assert.equal(big.store.size,many.parts);
  let rows=0,last=null;const names=new Set();
  for(const key of [...big.store.keys()].sort()){assert.match(key,/\/part-\d{3}\.snapshot\.enc$/);last=JSON.parse(await decryptInstructions(big.store.get(key),big));rows+=(last.tables.notifications||[]).length;Object.keys(last.tables).forEach(n=>names.add(n));}
  assert.equal(rows,total);assert.equal(last.parts,many.parts);assert.ok(names.has('bookings')&&names.has('properties'));
 }finally{f.db.close();}
});

test('without a bucket or a key the backup says it is not set up',async()=>{
 const f=await fixture();try{assert.deepEqual(await cloudBackup(f.db,{}),{configured:false});}finally{f.db.close();}
});

test('a passing Telegram outage does not fail the bot setup after a publication',async()=>{
 const {setupTelegram}=await import('../scripts/setup-telegram.mjs');let calls=0,waits=0;
 const fetcher=async url=>{
  if(String(url).includes('api.telegram.org')){calls++;if(calls<3)return new Response('Bad Gateway',{status:502});return Response.json({ok:true,result:{username:'aiqonaq_bot'}});}
  return Response.json({success:true,result:[{name:'SITE_PUBLIC_URL'}]});
 };
 const r=await setupTelegram({token:'123:secret',account:'acc',cfToken:'cf',site:'https://x.example.dev',fetcher,wait:async()=>{waits++;}});
 assert.equal(r.username,'aiqonaq_bot');assert.equal(waits,2);
 await assert.rejects(setupTelegram({token:'1:x',account:'a',cfToken:'c',site:'https://x.dev',fetcher:async()=>new Response('Bad Gateway',{status:502}),wait:async()=>{}}),/getMe failed: 502/);
});

test('a row deleted between two pages of a backup does not push later rows out of it',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('DELETE FROM notifications').run();
  const add=f.db.raw.prepare('INSERT INTO notifications VALUES (?,?,?,?,0,0)');for(let i=1;i<=5;i++)add.run('k'+i,'owner','Сообщение '+i,'keyset:'+i);
  // The first row disappears right after the first page of this table is read.
  const real=f.db.prepare.bind(f.db);let pages=0;
  f.db.prepare=sql=>{const s=real(sql);if(/FROM "notifications" WHERE rowid>/.test(sql)){const all=s.all.bind(s);s.all=async()=>{const r=await all();if(++pages===1)f.db.raw.prepare("DELETE FROM notifications WHERE id='k1'").run();return r;};}return s;};
  const c=config(),r=await cloudBackup(f.db,c,2,1e9);f.db.prepare=real;
  const saved=JSON.parse(await decryptInstructions(c.store.get(r.key),c)).tables.notifications.map(n=>n.id);
  assert.deepEqual(saved,['k1','k2','k3','k4','k5']);assert.ok(!('__rowid' in JSON.parse(await decryptInstructions(c.store.get(r.key),c)).tables.notifications[0]));
 }finally{f.db.close();}
});
