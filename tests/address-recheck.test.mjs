import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';
const {readPilotPolicy,savePilotPolicy,pilotPropertyVisibleSql}=await load('pilot-governance');
const {ensurePublishReview,decideParticipantReview}=await load('participant-security');

const TEXT='Светлое жильё в центре: рядом парк и набережная, есть всё для отдыха и работы, тихие соседи.';
function photos(f,n){return Array.from({length:n},()=>{const id=crypto.randomUUID();f.db.raw.prepare("INSERT INTO media(id,user_id,kind,data,width,height,bytes,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id,'owner','property','x',10,10,1,now());return id;});}
const versions=f=>f.db.raw.prepare('SELECT COALESCE(d.version,0) lv,p.version pv FROM property_policies p LEFT JOIN property_details d ON d.property_id=p.property_id WHERE p.property_id=?').get(f.property);
const body=(f,extra={})=>{const v=versions(f);return {title:'Test apartment',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:TEXT,price:10000,rooms:1,capacity:2,cleaningMinutes:90,published:true,expectedVersion:v.lv,policyVersion:v.pv,
 details:{type:'apartment',area:40,beds:2,bathrooms:1,floor:2,floors:5,checkinMethod:'meet',amenities:['wifi'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'No smoking'},...extra};};
// A shown flat approved by the platform, with the owner's review required.
async function shown(f,count=3){
 const ids=photos(f,count);await f.owner.saveListing(f.property,body(f,{photos:ids,published:false}));
 const current=await readPilotPolicy(f.db);await savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,confirmed:true},true);
 f.db.raw.prepare("UPDATE pilot_policy SET ai_review=0 WHERE id='global'").run();
 f.db.raw.prepare('INSERT INTO participant_reviews(id,user_id,role,property_id,status,method,reference,reviewer_id,notes,created_at,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'owner','owner',f.property,'approved','fixture','fixture','owner','ok',now(),now());
 await f.owner.saveListing(f.property,body(f,{photos:ids}));
 assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,1);
 return ids;
}
const visible=f=>f.db.raw.prepare('SELECT COUNT(*) n FROM properties p WHERE p.id=? AND '+pilotPropertyVisibleSql()).get(f.property).n;

test('a new address keeps the flat shown, hides it from new guests and asks for the check by itself',async()=>{
 const f=await fixture();try{
  const ids=await shown(f);assert.equal(visible(f),1);
  const saved=await f.owner.saveListing(f.property,body(f,{photos:ids,address:'Новая улица, 5'}));
  assert.equal(saved.moved,true);assert.match(saved.message,/Адрес изменён/);
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,1);
  assert.equal(visible(f),0);
  await ensurePublishReview(f.owner,f.property);
  const pending=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE status='pending'").all();assert.equal(pending.length,1);assert.match(pending[0].reference,/^Проверка нового адреса/);
  // The guest who already booked hears the new address.
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:address:%'").get().body,/Новая улица, 5.*бронь в силе/);
  // Further edits while the check is pending save normally and do not pile up requests.
  await f.owner.saveListing(f.property,body(f,{photos:ids,address:'Новая улица, 5',title:'Жильё у парка'}));await ensurePublishReview(f.owner,f.property);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM participant_reviews WHERE status='pending'").get().n,1);
  // Approval brings it back to guests with nothing more from the owner.
  await decideParticipantReview(f.owner,{id:pending[0].id,expectedVersion:pending[0].version,status:'approved',method:'fixture',notes:'ok'},true);
  assert.equal(visible(f),1);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:review:%'").get().body,/Новый адрес подтверждён/);
 }finally{f.db.close();}
});
test('bookings made before the address change keep working while the new address is checked',async()=>{
 const f=await fixture();try{
  const ids=await shown(f);
  const request=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+5*86400),end:iso(now()+5*86400+7200),guests:1,billingMode:'hourly',requestKey:'second',acceptTerms:true})).id;
  await f.owner.saveListing(f.property,body(f,{photos:ids,address:'Новая улица, 5'}));
  // A guest whose request is not confirmed yet hears about the change without the exact address.
  const notes=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:address:%'").all().map(n=>n.body);
  assert.equal(notes.length,2);assert.equal(notes.filter(n=>/Новая улица/.test(n)).length,1);assert.equal(notes.filter(n=>/после подтверждения брони/.test(n)).length,1);
  // New guests cannot book until the check passes.
  await assert.rejects(f.other.createBooking({propertyId:f.property,start:iso(now()+9*86400),end:iso(now()+9*86400+7200),guests:1,billingMode:'hourly',requestKey:'third',acceptTerms:true}));
  await f.owner.bookingAction(request,{action:'confirm',cleaningFee:3000});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(request).status,'confirmed');
  // A refused address stops them again.
  f.db.raw.prepare("UPDATE bookings SET status='requested' WHERE id=?").run(request);
  await ensurePublishReview(f.owner,f.property);const pending=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE status='pending'").get();
  await decideParticipantReview(f.owner,{id:pending.id,expectedVersion:pending.version,status:'rejected',method:'fixture',notes:'Дом не найден'},true);
  assert.throws(()=>f.db.raw.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(request),/pilot_owner_review_required/);
 }finally{f.db.close();}
});
test('a flat never approved stays closed for bookings',async()=>{
 const f=await fixture();try{
  const current=await readPilotPolicy(f.db);await savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,confirmed:true},true);
  assert.throws(()=>f.db.raw.prepare("UPDATE bookings SET start=start+60,end=end+60 WHERE id=?").run(f.booking),/pilot_owner_review_required/);
 }finally{f.db.close();}
});
test('edits of a shown flat pass the same rules as the first review',async()=>{
 const f=await fixture();try{
  const ids=await shown(f,4);
  await assert.rejects(f.owner.saveListing(f.property,body(f,{photos:ids,description:TEXT+' Пишите в WhatsApp +7 701 123 45 67.'})),/телефон, ссылки/);
  await assert.rejects(f.owner.saveListing(f.property,body(f,{photos:ids,rental:{...body(f).rental,houseRules:'Предоплата переводом на карту.'}})),/телефон, ссылки/);
  await assert.rejects(f.owner.saveListing(f.property,body(f,{photos:ids.slice(0,2)})),/не меньше 3 фото/);
  await f.owner.saveListing(f.property,body(f,{photos:ids.slice(0,3),description:TEXT+' Есть парковка во дворе.'}));
  // A draft is free: the review looks at it before guests do.
  await f.owner.saveListing(f.property,body(f,{photos:ids.slice(0,1),published:false,description:TEXT+' Телефон +7 701 123 45 67.'}));
 }finally{f.db.close();}
});
test('the short «Правила» form of the app keeps everything it does not show',async()=>{
 const f=await fixture();try{
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,repairBudget:5000,escalationContact:'Сестра',autoAssign:true});
  // What mobile/src/PropertyControl.tsx sends: prices, the AI's limits and the unchanged times and rules.
  await f.owner.savePolicy(f.property,{dailyPrice:12000,hourlyPrice:2500,minHours:3,nightlyPrice:0,deposit:5000,cleaningFee:3500,cleaningBudget:4000,checkinTime:'14:00',checkoutTime:'12:00',houseRules:'No smoking',maxDiscountPercent:10,minimumRate:1000,autoConfirm:true,autoExtension:true,maxExtensionHours:3,expectedVersion:2});
  const p=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(f.property);
  assert.deepEqual([p.repair_budget,p.escalation_contact,p.auto_assign,p.min_hours,p.auto_extension,p.max_extension_hours,p.max_discount_percent],[5000,'Сестра',1,3,1,3,10]);
  assert.equal(f.db.raw.prepare('SELECT price FROM properties WHERE id=?').get(f.property).price,12000);
  // «На ремонте» and «Закрыть заезды» are one tap with a ready reason; «Жильё готово» needs none.
  f.db.raw.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE property_id=?").run(f.property);
  await f.owner.readinessAction(f.property,{readiness:'blocked',note:'Владелец временно закрыл заезды.'});
  await f.owner.readinessAction(f.property,{readiness:'ready',inspected:true});
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness,'ready');
 }finally{f.db.close();}
});
