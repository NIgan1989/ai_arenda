import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {readPlatformAdmin,writePlatformAdmin,requirePlatformAdmin}=await load('platform-admin');
const {entryDestination,safeEntryReturn}=await load('entry');
const {adminSection,adminSectionPath}=await load('admin-navigation');
test('admin permission comes only from the server allowlist, never from role, email or submitted claims',async()=>{
 const f=await fixture();try{
  const config={PLATFORM_ADMIN_IDS:'operator'};
  for(const service of [f.owner,f.guest,f.cleaner,f.other]){
   await assert.rejects(readPlatformAdmin(service,'overview',{platformAdmin:true,role:'admin',email:'operator@example.test'},config),e=>e.status===403);
   await assert.rejects(writePlatformAdmin(service,'governance/policy',{confirmed:true,platformAdmin:true,requireOwnerReview:false,requireCleanerReview:false,requirePhone:false,expectedVersion:1},config),e=>e.status===403);
  }
  assert.throws(()=>requirePlatformAdmin('oper',config),e=>e.status===403);
  assert.throws(()=>requirePlatformAdmin('',config),e=>e.status===403);
  const assigned={PLATFORM_ADMIN_IDS:f.guest.userId};
  const overview=await readPlatformAdmin(f.guest,'overview',{},assigned);assert.equal(overview.counts.users,4);assert.equal(overview.counts.properties,1);assert.equal(overview.counts.bookings,1);assert.equal(overview.counts.unmapped,1);assert.equal(overview.counts.withoutPhotos,1);
  await assert.rejects(readPlatformAdmin(f.owner,'map',{},assigned),e=>e.status===403);const map=await readPlatformAdmin(f.guest,'map',{},assigned);assert.equal(map.properties.length,1);assert.equal(map.properties[0].bookings,1);assert.doesNotMatch(JSON.stringify(map),/PRIVATE ADDRESS|owner_id|guest_id|contact/);
  // Quality counters describe only published, non-demo listings, not private drafts.
  f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
  const drafts=await readPlatformAdmin(f.guest,'overview',{},assigned);assert.equal(drafts.counts.unmapped,0);assert.equal(drafts.counts.withoutPhotos,0);assert.equal(drafts.counts.drafts,1);
  const users=await readPlatformAdmin(f.guest,'users',{},assigned);assert.equal(users.total,4);for(const user of users.users){assert.equal(user.password_hash,undefined);assert.equal(user.recovery_hash,undefined);}
  const properties=await readPlatformAdmin(f.guest,'properties',{},assigned);assert.equal(properties.total,1);assert.equal(properties.items[0].address,undefined);
  await assert.rejects(readPlatformAdmin(f.guest,'properties',{page:'-1'},assigned));
  await assert.rejects(writePlatformAdmin(f.guest,'reviews/decide',{id:'anything'},assigned),/фактическую/);
  await assert.rejects(writePlatformAdmin(f.guest,'drop-database',{},assigned),e=>e.status===404);
  const result=await writePlatformAdmin(f.guest,'governance/policy',{confirmed:true,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,expectedVersion:1},assigned);assert.equal(result.version,2);
 }finally{f.db.close();}
});
test('management deep links accept known sections and cannot generate external navigation',()=>{
 assert.equal(adminSection('reviews'),'reviews');assert.equal(adminSectionPath('reviews'),'/admin?section=reviews');assert.equal(adminSectionPath('overview'),'/admin');
 for(const value of [null,'https://evil.test','../users','admin','unknown']){assert.equal(adminSection(value),'overview');assert.equal(adminSectionPath(value),'/admin');}
});
test('only default entry sends the administrator to management; explicit booking intent remains intact',()=>{
 assert.equal(entryDestination(undefined,true),'/admin');assert.equal(entryDestination(undefined,false),'/workspace/guest/map');
 const chosen='/workspace/guest/catalog?book=property&start=2026-11-15T14%3A00';assert.equal(entryDestination(chosen,true),chosen);
 assert.equal(safeEntryReturn('/admin'),'/admin');assert.equal(safeEntryReturn('//evil.test/admin'),'/workspace/guest/map');assert.equal(safeEntryReturn('/admin/unknown'),'/workspace/guest/map');
});
