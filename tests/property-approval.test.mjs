import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {readPilotPolicy,savePilotPolicy}=await load('pilot-governance');
const {ensurePublishReview}=await load('participant-security');
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');

async function requireReview(f){const current=await readPilotPolicy(f.db);await savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,confirmed:true},true);f.db.raw.prepare("UPDATE pilot_policy SET ai_review=0 WHERE id='global'").run();}
function readyDraft(f){
 f.db.raw.prepare('UPDATE properties SET published=0,description=? WHERE id=?').run('Светлое жильё с ремонтом, рядом парк и остановка, есть всё для проживания и работы.'.repeat(2),f.property);
 f.db.raw.prepare('INSERT INTO property_details(property_id,details,photos,revision,updated_at) VALUES (?,?,?,?,1) ON CONFLICT(property_id) DO UPDATE SET photos=excluded.photos').run(f.property,'{}','["photo-1"]',"r1");
}

test('a ready draft goes to the administrator check by itself, once',async()=>{
 const f=await fixture();try{
  await requireReview(f);readyDraft(f);
  const first=await ensurePublishReview(f.owner,f.property,{});assert.ok(first);
  assert.equal(await ensurePublishReview(f.owner,f.property,{}),null);
  const rows=f.db.raw.prepare("SELECT status,reference FROM participant_reviews WHERE property_id=? AND role='owner'").all(f.property);
  assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.match(rows[0].reference,/^Показать гостям после проверки/);
  // Someone else cannot send another owner's flat.
  assert.equal(await ensurePublishReview(f.other,f.property,{}),null);
 }finally{f.db.close();}
});

test('no request without the platform rule or for a draft without photos',async()=>{
 const f=await fixture();try{
  readyDraft(f);assert.equal(await ensurePublishReview(f.owner,f.property,{}),null);
  await requireReview(f);f.db.raw.prepare("UPDATE property_details SET photos='[]' WHERE property_id=?").run(f.property);
  assert.equal(await ensurePublishReview(f.owner,f.property,{}),null);
 }finally{f.db.close();}
});

test('the administrator approves a draft from «Недвижимость» and it is shown to guests',async()=>{
 const f=await fixture();try{
  await requireReview(f);readyDraft(f);const admin={PLATFORM_ADMIN_IDS:f.guest.userId};
  await assert.rejects(writePlatformAdmin(f.owner,'properties/approve',{propertyId:f.property,confirmed:true},admin),e=>e.status===403);
  await assert.rejects(writePlatformAdmin(f.guest,'properties/approve',{propertyId:f.property},admin),/Подтвердите/);
  // The name on the document of the right to let is compared with the owner and the Kaspi recipient first.
  await assert.rejects(writePlatformAdmin(f.guest,'properties/approve',{propertyId:f.property,confirmed:true},admin),/ФИО в удостоверении/);
  const docs=await readPlatformAdmin(f.guest,'rights',{propertyId:f.property},admin);assert.equal(docs.names.profile,'Owner');
  const result=await writePlatformAdmin(f.guest,'properties/approve',{propertyId:f.property,confirmed:true,namesMatch:true},admin);
  assert.equal(result.shown,true);
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,1);
  // The photo is deleted after the check; the record stays, and guests see «Жильё проверено».
  const doc=f.db.raw.prepare('SELECT * FROM property_right_docs WHERE property_id=?').get(f.property);
  assert.equal(doc.data,'');assert.ok(doc.checked_at);assert.equal(doc.checked_by,f.guest.userId);
  await assert.rejects(readPlatformAdmin(f.guest,'rights/photo',{id:doc.id},admin),e=>e.status===410);
  assert.equal((await f.guest.roleState('guest',{catalog:true})).properties.find(p=>p.id===f.property).verified,true);
  const list=await readPlatformAdmin(f.guest,'properties',{},admin);assert.equal(list.items[0].review_status,'approved');
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND body LIKE '%показано гостям%'").get());
 }finally{f.db.close();}
});

test('an open owner request is used instead of a second one',async()=>{
 const f=await fixture();try{
  await requireReview(f);readyDraft(f);const admin={PLATFORM_ADMIN_IDS:f.guest.userId};
  await ensurePublishReview(f.owner,f.property,{});
  await writePlatformAdmin(f.guest,'properties/approve',{propertyId:f.property,confirmed:true,namesMatch:true},admin);
  const rows=f.db.raw.prepare("SELECT status FROM participant_reviews WHERE property_id=?").all(f.property);
  assert.deepEqual(rows.map(r=>r.status),['approved']);
 }finally{f.db.close();}
});

test('approval is kept and reported honestly when another rule holds publication back',async()=>{
 const f=await fixture();try{
  const current=await readPilotPolicy(f.db);await savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:true,requireCleanerReview:false,requirePhone:true,confirmed:true},true);
  readyDraft(f);const admin={PLATFORM_ADMIN_IDS:f.guest.userId};
  const result=await writePlatformAdmin(f.guest,'properties/approve',{propertyId:f.property,confirmed:true,namesMatch:true},admin);
  assert.equal(result.shown,false);assert.match(result.message,/подтвердить телефон/);
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,0);
  assert.equal(f.db.raw.prepare("SELECT status FROM participant_reviews WHERE property_id=?").get(f.property).status,'approved');
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND body LIKE '%можно показать гостям%'").get());
 }finally{f.db.close();}
});
