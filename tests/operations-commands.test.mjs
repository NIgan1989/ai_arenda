import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {prepareAdministratorCommand,decideAdministratorCommand}=await load('administrator-commands');
test('chat creates a reviewable draft; confirmation creates exactly one job and repeated confirmation is safe',async()=>{
 const f=await fixture();try{
  const result=await prepareAdministratorCommand(f.owner,'owner',{action:'create_cleaning',propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,note:'Clean the apartment'},'tool-call');const c=result.commands[0];assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,1);
  const body={id:c.id,action:'execute',confirmed:true,expectedVersion:1};await assert.rejects(decideAdministratorCommand(f.guest,'guest',body),e=>e.status===403);
  const first=await decideAdministratorCommand(f.owner,'owner',body),again=await decideAdministratorCommand(f.owner,'owner',body);assert.equal(first.id,again.id);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,2);
 }finally{f.db.close();}
});
test('stale limits and expired drafts never create work; injected property IDs cannot cross accounts',async()=>{
 const f=await fixture();try{
  await assert.rejects(prepareAdministratorCommand(f.other,'owner',{action:'create_cleaning',propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,note:'Injected'},'bad'),e=>e.status===403);
  const draft=await prepareAdministratorCommand(f.owner,'owner',{action:'create_cleaning',propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,note:'Test'},'draft');
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,cleaningBudget:3500});
  await assert.rejects(decideAdministratorCommand(f.owner,'owner',{id:draft.commands[0].id,action:'execute',confirmed:true,expectedVersion:1}),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,1);
 }finally{f.db.close();}
});
test('saved issue commands and job operation keys recover after interruption without duplicate effects',async()=>{
 const f=await fixture();try{
  const draft=await prepareAdministratorCommand(f.guest,'guest',{action:'report_issue',bookingId:f.booking,note:'Broken light'},'issue-draft'),id=draft.commands[0].id;
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Broken light',requestKey:'command:'+id});
  f.db.raw.prepare("UPDATE administrator_commands SET status='running',lease_until=0 WHERE id=?").run(id);
  await decideAdministratorCommand(f.guest,'guest',{id,action:'execute',confirmed:true,expectedVersion:1});assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM administrator_issues').get().n,1);
 }finally{f.db.close();}
});
