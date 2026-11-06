import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {fixture,now} from './helpers/platform.mjs';
const out=process.cwd()+'/outputs/deep-link-tests-'+process.pid;mkdirSync(out,{recursive:true});
writeFileSync(out+'/deep-links.mjs',ts.transpileModule(readFileSync('mobile/src/deep-links.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {parseProcessLink,resolveProcessLink,ProcessLinkQueue}=await import(pathToFileURL(out+'/deep-links.mjs'));
const origin='https://rent.example',uri='aiarenda://workspace/guest/bookings?entity=booking-1';

test('links allow only read-only business sections, bounded IDs and exact HTTPS origin',()=>{
 assert.deepEqual(parseProcessLink(uri,origin),{role:'guest',section:'bookings',entityId:'booking-1'});
 assert.deepEqual(parseProcessLink('https://rent.example/workspace/owner/properties?entity=property_1',origin),{role:'owner',section:'properties',entityId:'property_1'});
 assert.deepEqual(parseProcessLink('aiarenda:///workspace/cleaner/calendar',origin),{role:'cleaner',section:'calendar'});
 for(const bad of ['https://evil.example/workspace/guest/bookings?entity=one','http://rent.example/workspace/guest/bookings','https://rent.example.evil.test/workspace/guest/bookings','https://user:secret@rent.example/workspace/guest/bookings','aiarenda://workspace:9/guest/bookings','aiarenda://other/guest/bookings','aiarenda://workspace/guest/properties','aiarenda://workspace/admin/account','aiarenda://workspace/guest/bookings/one','aiarenda://workspace/guest/bookings?action=confirm','aiarenda://workspace/guest/bookings?entity=one&entity=two','aiarenda://workspace/guest/bookings?entity=one&token=secret','aiarenda://workspace/guest/account?entity=one','aiarenda://workspace/guest/bookings?entity=%2fprivate','aiarenda://workspace/guest/bookings#confirm','aiarenda://workspace/guest/bookings?entity='+ 'a'.repeat(101)])assert.equal(parseProcessLink(bad,origin),null,bad);
 assert.equal(parseProcessLink('https://rent.example/workspace/guest/bookings','http://rent.example'),null);
});

test('queue waits for login, drops cross-account/expired intent, deduplicates OS events and never consumes a newer link',()=>{
 const q=new ProcessLinkQueue(10000);assert.equal(q.offer(uri,origin,null,1000),true);assert.equal(q.offer(uri,origin,null,1001),false);
 const initial=q.claim('guest',2000);assert.equal(q.isCurrent(initial.id,'guest',2001),true);assert.equal(q.isCurrent(initial.id,null,2001),false);
 assert.equal(q.claim('other',2002),null);assert.equal(q.pending,false);
 q.offer(uri,origin,'guest',4000);const old=q.claim('guest',4000);q.offer('aiarenda://workspace/guest/account',origin,'guest',4001);q.consume(old.id);assert.equal(q.pending,true);assert.equal(q.isCurrent(old.id,'guest',4001),false);
 assert.equal(q.claim('guest',20000),null);assert.equal(q.pending,false);
});

test('opening a link requires fresh server role state and verifies actual process membership without changing business facts',async()=>{
 const f=await fixture();try{
  const snapshot=async(service,role)=>({...await service.roleState(role),user:{id:service.userId}});
  const guest=await snapshot(f.guest,'guest'),link={role:'guest',section:'bookings',entityId:f.booking};
  assert.deepEqual(resolveProcessLink(link,guest,'guest'),{section:'bookings',block:'bookings',payload:{ids:[f.booking],role:'guest',mode:'guest'}});
  assert.throws(()=>resolveProcessLink(link,guest,'other'));assert.throws(()=>resolveProcessLink({...link,role:'owner'},guest,'guest'));assert.throws(()=>resolveProcessLink({...link,entityId:'foreign'},guest,'guest'));
  const before=f.db.raw.prepare('SELECT status,payment_status FROM bookings WHERE id=?').get(f.booking);
  const owner=await snapshot(f.owner,'owner'),other=await snapshot(f.other,'owner');assert.equal(resolveProcessLink({role:'owner',section:'properties',entityId:f.property},owner,'owner').block,'properties');assert.throws(()=>resolveProcessLink({role:'owner',section:'properties',entityId:f.property},other,'other'));
  const worker=await snapshot(f.cleaner,'cleaner');assert.throws(()=>resolveProcessLink({role:'cleaner',section:'assignments',entityId:f.job.id},worker,'cleaner'));
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='assigned',assigned_to='cleaner',start=?,end=? WHERE id=?").run(now()+30,now()+3600,f.job.id);
  const assigned=await snapshot(f.cleaner,'cleaner');assert.equal(resolveProcessLink({role:'cleaner',section:'assignments',entityId:f.job.id},assigned,'cleaner').block,'jobs');
  assert.deepEqual(f.db.raw.prepare('SELECT status,payment_status FROM bookings WHERE id=?').get(f.booking),before);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM journey_sessions').get().n,0);
 }finally{f.db.close();}
});
