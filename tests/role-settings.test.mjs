import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {experienceFor,managementTab,profileWorkFields}=await load('role-experience');
const {writeOperations}=await load('operations-api');
test('links to settings outside the active role resolve to its own starting section',()=>{
 assert.equal(managementTab('guest','import'),'finance');assert.equal(managementTab('cleaner','calendars'),'dispatch');
 assert.equal(managementTab('owner','calendars'),'calendars');assert.equal(managementTab('guest','access'),'access');
 assert.equal(managementTab('cleaner','health'),'dispatch');assert.equal(managementTab('guest','admissions'),'finance');
 assert.notEqual(experienceFor('guest').description,experienceFor('owner').description);
});
test('editing common identity from another role preserves the cleaner work profile',async()=>{
 const f=await fixture();try{
  const p=await f.cleaner.profile(),work=profileWorkFields('guest',{districts:'Changed through guest form'},p);
  await f.cleaner.editProfile({...p,...work,name:'Updated identity',avatarId:p.avatar_id,workStatus:p.work_status||'available',expectedVersion:p.profile_version||0});
  const after=await f.cleaner.profile();assert.equal(after.name,'Updated identity');for(const key of ['districts','experience','availability'])assert.equal(after[key],p[key]);
  assert.equal(profileWorkFields('cleaner',{districts:'Новый район'},p).districts,'Новый район');
 }finally{f.db.close();}
});
test('role-specific settings retain server authorization even with a direct request',async()=>{
 const f=await fixture();try{
  for(const [service,role,route] of [[f.guest,'guest','rules'],[f.guest,'guest','calendar/source'],[f.cleaner,'cleaner','finance'],[f.cleaner,'cleaner','import/preview'],[f.owner,'owner','dispatch/preferences']])await assert.rejects(writeOperations(service,role,route.split('/'),{}),e=>e.status===403);
 }finally{f.db.close();}
});
