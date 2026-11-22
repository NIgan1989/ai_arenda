import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,rightDoc} from './helpers/platform.mjs';
const {flatChecks,cleanerChecks,verdictOf,normalAddress,hasContacts,sweepReviews,AI_REVIEWER}=await load('admin-autocheck');
const {requestParticipantReview,decideParticipantReview}=await load('participant-security');
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
// A place is never approved by the AI alone: with every rule passed and the document attached, a person decides.
test('a complete flat with its document goes to a person: the AI never approves a place by itself',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f);
  const result=await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(result.verdict,'escalate');assert.match(result.message,/сверит их вручную/);
  const review=f.db.raw.prepare('SELECT * FROM participant_reviews WHERE property_id=?').get(f.property);
  assert.equal(review.status,'pending');assert.equal(review.ai_verdict,'approve');
  assert.equal(JSON.parse(review.ai_checks).find(c=>c.key==='rights').state,'ok');
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,0);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'admin:review:%'").get().body,/документ о праве приложен, удостоверение приложено/);
  // The document is not required (owner's decision 2026-11-22): without it the check says the place will be
  // «Жильё не проверено», and an administrator can still approve it after looking at the fields, photos and text.
  f.db.raw.prepare('DELETE FROM property_right_docs WHERE property_id=?').run(f.property);
  f.db.raw.prepare('UPDATE participant_reviews SET ai_checked_at=NULL').run();await sweepReviews(f.db,{});
  const rights=JSON.parse(f.db.raw.prepare('SELECT ai_checks FROM participant_reviews WHERE id=?').get(review.id).ai_checks).find(c=>c.key==='rights');
  assert.equal(rights.state,'ok');assert.match(rights.note,/Жильё не проверено/);
  await decideParticipantReview(f.owner,{id:review.id,expectedVersion:f.db.raw.prepare('SELECT version FROM participant_reviews WHERE id=?').get(review.id).version,status:'approved',method:'fixture',notes:'ok'},true);
  assert.equal(f.db.raw.prepare('SELECT status FROM participant_reviews WHERE id=?').get(review.id).status,'approved');
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
  assert.equal(f.db.raw.prepare('SELECT status FROM participant_reviews WHERE property_id=?').get(f.property).status,'pending','a person approves a place');
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
// A person looks at the performer's ID card: with every rule passed the AI hands the request over, never admits alone.
test('a cleaner with a name, a photo and an ID goes to a person, who admits for six months',async()=>{
 const f=await fixture();try{
  await strict(f);f.db.raw.prepare("INSERT OR REPLACE INTO profile_details(user_id,avatar_id,revision,updated_at) VALUES ('cleaner','a1','r',?)").run(now());
  const result=await requestParticipantReview(f.cleaner,'cleaner',{reference:'Отклик'},{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(result.verdict,'escalate');assert.match(result.message,/удостоверение переданы администратору/);
  const review=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE user_id='cleaner'").get();
  assert.equal(review.status,'pending');assert.equal(JSON.parse(review.ai_checks).find(c=>c.key==='identity').state,'ok');
  await assert.rejects(writePlatformAdmin(f.guest,'reviews/decide',{id:review.id,status:'approved',expectedVersion:review.version,confirmed:true,method:'Администратор',notes:'ok',validUntil:new Date(Date.now()+180*86400000).toISOString()},{PLATFORM_ADMIN_IDS:'guest'}),/ФИО в удостоверении/);
  await writePlatformAdmin(f.guest,'reviews/decide',{id:review.id,status:'approved',expectedVersion:review.version,confirmed:true,namesMatch:true,method:'Администратор',notes:'ok',validUntil:new Date(Date.now()+180*86400000).toISOString()},{PLATFORM_ADMIN_IDS:'guest'});
  assert.equal(f.db.raw.prepare("SELECT status FROM participant_reviews WHERE user_id='cleaner'").get().status,'approved');
  const id=f.db.raw.prepare("SELECT data,checked_by FROM identity_docs WHERE user_id='cleaner'").get();
  assert.equal(id.data,'','the photo is deleted after the check');assert.equal(id.checked_by,'guest');
 }finally{f.db.close();}
});
test('a flat changed after the request still reaches the administrator instead of hiding',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f,1);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  f.db.raw.prepare("INSERT INTO review_property_bindings(property_id,revision) VALUES (?,1) ON CONFLICT(property_id) DO UPDATE SET revision=revision+1").run(f.property);
  readyFlat(f,4);rightDoc(f.db,f.property,'owner');f.db.raw.prepare('UPDATE participant_reviews SET ai_checked_at=0').run();
  assert.equal((await sweepReviews(f.db,{PLATFORM_ADMIN_IDS:'admin'})).approve,1);
  const review=f.db.raw.prepare('SELECT * FROM participant_reviews WHERE property_id=?').get(f.property);
  assert.equal(review.status,'pending');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:review:%'").get().n,1);
 }finally{f.db.close();}
});
test('a doubtful request reaches the administrator in Telegram with buttons; only the administrator can decide',async()=>{
 const f=await fixture(),fetch=globalThis.fetch,{RentalService}=await load('service'),{createTelegramLink,acceptTelegramLink,deliverOutbox}=await load('delivery'),serviceFor=id=>new RentalService(f.db,id);
 const config={TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_BOT_USERNAME:'rental_test_bot',TELEGRAM_WEBHOOK_SECRET:'s',SITE_PUBLIC_URL:'https://rental.example.test',PLATFORM_ADMIN_IDS:'guest'};
 try{
  const calls=[];globalThis.fetch=async(url,request)=>{calls.push({method:String(url).split('/').pop(),body:JSON.parse(request.body)});return Response.json({ok:true,result:{message_id:9}});};
  const link=await createTelegramLink(f.guest,'guest',config);await acceptTelegramLink(f.db,{message:{text:'/start '+new URL(link.url).searchParams.get('start'),chat:{type:'private',id:321},from:{id:321,is_bot:false}}},'s',config,serviceFor);
  const ownerLink=await createTelegramLink(f.owner,'owner',config);await acceptTelegramLink(f.db,{message:{text:'/start '+new URL(ownerLink.url).searchParams.get('start'),chat:{type:'private',id:555},from:{id:555,is_bot:false}}},'s',config,serviceFor);
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f);
  f.db.raw.prepare("UPDATE properties SET description=description||' Пишите в WhatsApp' WHERE id=?").run(f.property);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},config);
  calls.length=0;await deliverOutbox(f.db,config,30,serviceFor);
  const sent=calls.filter(c=>c.method==='sendMessage').find(c=>c.body.chat_id==='321').body;
  assert.match(sent.text,/ждёт проверки/);const [[yes,no],[open]]=sent.reply_markup.inline_keyboard;
  assert.equal(open.url,'https://rental.example.test/admin?section=reviews');assert.ok(yes.callback_data.length<=64&&no.callback_data.length<=64);
  const tap=(data,from)=>acceptTelegramLink(f.db,{callback_query:{id:'q',data,from:{id:from,is_bot:false},message:{message_id:9,text:sent.text,chat:{type:'private',id:from}}}},'s',config,serviceFor);
  await tap(yes.callback_data,555);assert.equal(f.db.raw.prepare('SELECT status FROM participant_reviews WHERE property_id=?').get(f.property).status,'pending');
  const before=f.db.raw.prepare('SELECT description FROM properties WHERE id=?').get(f.property).description;
  f.db.raw.prepare("UPDATE properties SET description=replace(description,' Пишите в WhatsApp','') WHERE id=?").run(f.property);
  await tap(yes.callback_data,321);assert.equal(f.db.raw.prepare('SELECT status FROM participant_reviews WHERE property_id=?').get(f.property).status,'pending');
  f.db.raw.prepare('UPDATE properties SET description=? WHERE id=?').run(before,f.property);
  assert.equal((await tap(yes.callback_data,321)).decided,true);
  const review=f.db.raw.prepare('SELECT * FROM participant_reviews WHERE property_id=?').get(f.property);
  assert.equal(review.status,'approved');assert.equal(review.reviewer_id,'guest');
  assert.equal((await tap(no.callback_data,321)).decided,true);assert.equal(f.db.raw.prepare('SELECT status FROM participant_reviews WHERE property_id=?').get(f.property).status,'approved');
 }finally{globalThis.fetch=fetch;f.db.close();}
});
test('after the city changes the old pin does not count, and the review request moves the pin by the new address',async()=>{
 const f=await fixture(),original=globalThis.fetch;try{
  const {PUBLISH_REVIEW}=await load('listing-edit');await strict(f);readyFlat(f);
  f.db.raw.prepare("UPDATE properties SET city='Алматы',address='Nexpo city, Рыскулова 5' WHERE id=?").run(f.property);
  globalThis.fetch=async()=>new Response('[]');
  const missed=await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  assert.notEqual(missed.verdict,'approve');
  const notified=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id=? ORDER BY created_at DESC").all(f.ownerId||f.owner.userId).map(n=>n.body).join(' ');
  assert.match(notified,/«Адрес»/);
  // The right document proves one address: the new city needs it again (publication audit 2026-11-22).
  rightDoc(f.db,f.property,'owner');
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('nominatim')?[{lon:'76.93',lat:'43.24'}]:[]));
  const placed=await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin'});
  assert.equal(placed.verdict,'escalate','handed to a person with every rule passed');
 }finally{globalThis.fetch=original;f.db.close();}
});
