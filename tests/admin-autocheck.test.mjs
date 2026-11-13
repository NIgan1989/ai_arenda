import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {flatChecks,cleanerChecks,verdictOf,normalAddress,hasContacts,sweepReviews,AI_REVIEWER}=await load('admin-autocheck');
const {requestParticipantReview}=await load('participant-security');
const {readPilotPolicy,savePilotPolicy}=await load('pilot-governance');
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');

const good={description:'Светлая квартира в центре: двуспальная кровать, кухня, стиральная машина, быстрый Wi-Fi, рядом остановка.',title:'Квартира у парка',photos:5,mapped:true,price:12000,comparable:[10000,11000,13000,14000],duplicateAddress:false,rejectedBefore:0,openComplaints:0};
const LONG='Светлая квартира в центре: двуспальная кровать, кухня, стиральная машина, быстрый Wi-Fi, рядом остановка и магазины.';
async function strict(f,fields={}){const current=await readPilotPolicy(f.db);return savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:true,requireCleanerReview:true,requirePhone:false,confirmed:true,...fields},true);}
function readyFlat(f,photos=4){
 f.db.raw.prepare('UPDATE properties SET published=0,description=? WHERE id=?').run(LONG,f.property);
 f.db.raw.prepare("INSERT OR REPLACE INTO property_details(property_id,photos,revision,updated_at) VALUES (?,?,'r1',?)").run(f.property,JSON.stringify(Array.from({length:photos},(_,i)=>'m'+i)),now());
 f.db.raw.prepare("INSERT OR REPLACE INTO property_locations(property_id,longitude,latitude,source,address_fingerprint,updated_at) SELECT ?,76.95,52.28,'owner',city||'|'||district||'|'||address,? FROM properties WHERE id=?").run(f.property,now(),f.property);
}

test('flat rules approve a complete listing, ask the owner for missing parts and hand doubts to the administrator',()=>{
 assert.equal(verdictOf(flatChecks(good)),'approve');
 const missing=flatChecks({...good,photos:1,mapped:false});assert.equal(verdictOf(missing),'fix');assert.deepEqual(missing.filter(c=>c.state==='fix').map(c=>c.key),['photos','map']);
 assert.equal(verdictOf(flatChecks({...good,price:2000})),'escalate');
 assert.equal(verdictOf(flatChecks({...good,price:60000})),'escalate');
 assert.equal(verdictOf(flatChecks({...good,comparable:[]})),'approve');
 assert.equal(verdictOf(flatChecks({...good,duplicateAddress:true})),'escalate');
 assert.equal(verdictOf(flatChecks({...good,description:good.description+' Звоните +7 701 123 45 67'})),'escalate');
 assert.equal(verdictOf(flatChecks({...good,rejectedBefore:1})),'escalate');
 assert.equal(verdictOf(flatChecks({...good,photos:1,openComplaints:2})),'escalate');
});
test('contacts, direct payment and address spelling are recognised',()=>{
 assert.ok(hasContacts('пишите в ватсап'));assert.ok(hasContacts('предоплата на Kaspi Gold'));assert.ok(hasContacts('8 (777) 123-45-67'));assert.ok(!hasContacts('Рядом парк, 5 минут до остановки, 2 этаж из 9'));
 assert.equal(normalAddress('Павлодар','ул. Ленина, д. 5'),normalAddress('павлодар','Ленина 5'));assert.notEqual(normalAddress('Павлодар','Ленина 5'),normalAddress('Павлодар','Ленина 7'));
});
test('cleaner rules need a name and a photo, history goes to the administrator',()=>{
 assert.equal(verdictOf(cleanerChecks({name:'Айгуль',avatar:true,rejectedBefore:0,openComplaints:0})),'approve');
 assert.equal(verdictOf(cleanerChecks({name:'Айгуль',avatar:false,rejectedBefore:0,openComplaints:0})),'fix');
 assert.equal(verdictOf(cleanerChecks({name:'Гость',avatar:true,rejectedBefore:0,openComplaints:0})),'fix');
 assert.equal(verdictOf(cleanerChecks({name:'Айгуль',avatar:true,rejectedBefore:0,openComplaints:1})),'escalate');
});
test('a complete flat is approved by the AI administrator and shown on the map at once',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f);
  const result=await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(result.verdict,'approve');
  const review=f.db.raw.prepare('SELECT * FROM participant_reviews WHERE property_id=?').get(f.property);
  assert.equal(review.status,'approved');assert.equal(review.reviewer_id,AI_REVIEWER);assert.match(review.notes,/Все правила пройдены/);
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,1);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:%'").get().n,0);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'owner:review:%'").get().body,/показана гостям/);
 }finally{f.db.close();}
});
test('a flat with too few photos waits for the owner and is approved by the sweep once fixed',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f,1);
  const result=await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(result.verdict,'fix');assert.match(result.message,/нужно не меньше 3/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:%'").get().n,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'owner:review-fix:%'").get().n,1);
  readyFlat(f,4);f.db.raw.prepare('UPDATE participant_reviews SET ai_checked_at=0').run();
  assert.equal((await sweepReviews(f.db,{})).approve,1);
  assert.equal(f.db.raw.prepare('SELECT status FROM participant_reviews WHERE property_id=?').get(f.property).status,'approved');
 }finally{f.db.close();}
});
test('a doubtful flat goes to the administrator with the reason, and the administrator can switch the AI off',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f);
  f.db.raw.prepare("UPDATE properties SET description=description||' Пишите в WhatsApp' WHERE id=?").run(f.property);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'owner'});
  const review=f.db.raw.prepare('SELECT * FROM participant_reviews WHERE property_id=?').get(f.property);
  assert.equal(review.status,'pending');assert.equal(review.ai_verdict,'escalate');
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'admin:review:%'").get().body,/просьба оплатить напрямую|ссылка/);
  const page=await readPlatformAdmin(f.owner,'reviews',{},{PLATFORM_ADMIN_IDS:'owner'});
  assert.equal(page.pendingReviews[0].ai_checks.find(c=>c.key==='contacts').state,'risk');assert.equal(page.policy.ai_review,1);
  assert.equal((await readPlatformAdmin(f.owner,'overview',{},{PLATFORM_ADMIN_IDS:'owner'})).counts.reviews,1);
  await writePlatformAdmin(f.owner,'reviews/ai',{enabled:false},{PLATFORM_ADMIN_IDS:'owner'});
  assert.equal((await readPilotPolicy(f.db)).ai_review,0);
  await assert.rejects(writePlatformAdmin(f.guest,'reviews/ai',{enabled:true},{PLATFORM_ADMIN_IDS:'owner'}),e=>e.status===403);
 }finally{f.db.close();}
});
test('a cleaner with a name and a photo is admitted for six months on the first response',async()=>{
 const f=await fixture();try{
  await strict(f);f.db.raw.prepare("INSERT OR REPLACE INTO profile_details(user_id,avatar_id,revision,updated_at) VALUES ('cleaner','a1','r',?)").run(now());
  const result=await requestParticipantReview(f.cleaner,'cleaner',{reference:'Отклик'},{});
  assert.equal(result.verdict,'approve');
  const review=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE user_id='cleaner'").get();
  assert.equal(review.status,'approved');assert.ok(review.valid_until>now()+170*86400);
 }finally{f.db.close();}
});
test('an approval refused because the flat changed after the request goes to the administrator instead of hiding',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f,1);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  f.db.raw.prepare("INSERT INTO review_property_bindings(property_id,revision) VALUES (?,1) ON CONFLICT(property_id) DO UPDATE SET revision=revision+1").run(f.property);
  readyFlat(f,4);f.db.raw.prepare('UPDATE participant_reviews SET ai_checked_at=0').run();
  assert.equal((await sweepReviews(f.db,{PLATFORM_ADMIN_IDS:'admin'})).escalate,1);
  const review=f.db.raw.prepare('SELECT * FROM participant_reviews WHERE property_id=?').get(f.property);
  assert.equal(review.status,'pending');assert.equal(review.ai_verdict,'escalate');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:review:%'").get().n,1);
 }finally{f.db.close();}
});
