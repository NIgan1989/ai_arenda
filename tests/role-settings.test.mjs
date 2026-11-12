import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {experienceFor,managementTab,managementMenu,managementSection,offerStep,profileWorkFields}=await load('role-experience');
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
test('management opens as a list of the sections of the role with their state',()=>{
 const state={properties:[{auto_offers:1,access_version:0},{auto_offers:0,access_version:2}],finance:{totals:{operatingBalance:12500}},delivery:{channels:[{enabled:1,verified_at:5},{enabled:1,verified_at:null}]},security:{phone:{verified_at:7}},sources:[]};
 const owner=managementMenu('owner',state),rows=owner.flatMap(g=>g.rows),status=id=>rows.find(r=>r.id===id).status;
 assert.deepEqual(owner.map(g=>g.label),['Объекты','Финансы','Интеграции','Контроль']);assert.equal(rows.length,experienceFor('owner').tabs.length);
 assert.equal(status('dispatch'),'1 из 2');assert.equal(status('access'),'1 из 2');assert.match(status('finance'),/12.500 ₸/);assert.equal(status('connections'),'Каналов: 1');assert.equal(status('reviews'),'Подтверждён');assert.equal(status('calendars'),'Нет');
 const guest=managementMenu('guest',null).flatMap(g=>g.rows);assert.ok(!guest.some(r=>['import','calendars','health','dispatch'].includes(r.id)));assert.ok(guest.every(r=>r.status===''));
 assert.equal(managementMenu('cleaner',{dispatch:{receiveOffers:false}}).flatMap(g=>g.rows).find(r=>r.id==='dispatch').status,'Выключены');
 assert.equal(managementSection('guest','import'),null);assert.equal(managementSection('owner','import'),'import');assert.equal(managementSection('owner',null),null);
});
test('the answer time moves over the steps a person would pick',()=>{
 assert.equal(offerStep(10,1),15);assert.equal(offerStep(10,-1),5);assert.equal(offerStep(12,1),15);assert.equal(offerStep(12,-1),10);assert.equal(offerStep(120,1),120);assert.equal(offerStep(2,-1),2);
});
