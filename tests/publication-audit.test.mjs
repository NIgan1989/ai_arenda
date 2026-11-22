// Publication audit 2026-11-22: what «на карте» means, a refused check, a moved flat's guests, the right document of
// an address and the rooms of a hotel added after its approval.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load,rightDoc} from './helpers/platform.mjs';
const {readPilotPolicy,savePilotPolicy}=await load('pilot-governance');
const {requestParticipantReview,ensurePublishReview,decideParticipantReview}=await load('participant-security');
const {saveMapPoint}=await load('map-workspace');
const {setRoomCount}=await load('room-units');
const {PUBLISH_REVIEW}=await load('listing-edit');

const TEXT='Светлое жильё в центре: рядом парк и набережная, есть всё для отдыха и работы, тихие соседи.';
function photos(f,n){return Array.from({length:n},()=>{const id=crypto.randomUUID();f.db.raw.prepare("INSERT INTO media(id,user_id,kind,data,width,height,bytes,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id,'owner','property','x',10,10,1,now());return id;});}
const versions=f=>f.db.raw.prepare('SELECT COALESCE(d.version,0) lv,p.version pv FROM property_policies p LEFT JOIN property_details d ON d.property_id=p.property_id WHERE p.property_id=?').get(f.property);
const body=(f,extra={})=>{const v=versions(f);return {title:'Test apartment',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:TEXT,price:10000,rooms:1,capacity:2,cleaningMinutes:90,published:true,expectedVersion:v.lv,policyVersion:v.pv,
 details:{type:'apartment',area:40,beds:2,bathrooms:1,floor:2,floors:5,checkinMethod:'meet',amenities:['wifi'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'No smoking'},...extra};};
async function strict(f){const current=await readPilotPolicy(f.db);await savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,confirmed:true},true);f.db.raw.prepare("UPDATE pilot_policy SET ai_review=0 WHERE id='global'").run();}
// A draft with a full description and the given number of photos, with or without its point on the map.
function draft(f,count,mapped){
 f.db.raw.prepare('UPDATE properties SET published=0,description=? WHERE id=?').run(TEXT,f.property);
 f.db.raw.prepare("INSERT OR REPLACE INTO property_details(property_id,photos,revision,updated_at) VALUES (?,?,'r1',?)").run(f.property,JSON.stringify(Array.from({length:count},(_,i)=>'m'+i)),now());
 if(mapped)f.db.raw.prepare("INSERT OR REPLACE INTO property_locations(property_id,longitude,latitude,source,address_fingerprint,updated_at) SELECT ?,76.95,52.28,'owner',city||'|'||district||'|'||address,? FROM properties WHERE id=?").run(f.property,now(),f.property);
}
const pending=f=>f.db.raw.prepare("SELECT * FROM participant_reviews WHERE property_id=? AND status='pending' ORDER BY rowid DESC").get(f.property);
const decide=(f,status,notes='ok')=>{const r=pending(f);return decideParticipantReview(f.owner,{id:r.id,expectedVersion:r.version,status,method:'fixture',notes},true);};
const published=(f,id=f.property)=>f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(id).published;
const notice=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ? ORDER BY created_at DESC,rowid DESC').get(user,like)?.body;
// A shown flat approved by the platform, with the owner's review required.
async function shown(f){
 const ids=photos(f,3);await f.owner.saveListing(f.property,body(f,{photos:ids,published:false}));await strict(f);
 f.db.raw.prepare('INSERT INTO participant_reviews(id,user_id,role,property_id,status,method,reference,reviewer_id,notes,created_at,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'owner','owner',f.property,'approved','fixture','fixture','owner','ok',now(),now());
 await f.owner.saveListing(f.property,body(f,{photos:ids}));assert.equal(published(f),1);
 return ids;
}

test('an approval without a point and three photos waits, and the flat shows itself once they are there',async()=>{
 const f=await fixture();try{
  await strict(f);draft(f,1,false);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'});
  await decide(f,'approved');
  assert.equal(published(f),0,'not on the map without a point and photos');
  assert.match(notice(f,'owner','owner:review:%'),/осталось: добавить фото: нужно не меньше 3, сейчас 1; поставить адрес на карту/);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM show_waiting').get().n,1);
  // Photos alone are not enough; the point brings it to guests with nothing more from the owner or the administrator.
  draft(f,3,false);
  await saveMapPoint(f.owner,'owner',{propertyId:f.property,longitude:76.95,latitude:52.28,confirmed:true,version:0});
  assert.equal(published(f),1);
  assert.match(notice(f,'owner','owner:shown:%'),/показано гостям на карте/);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM show_waiting').get().n,0);
 }finally{f.db.close();}
});
test('a refused check is not sent again by a save; the owner sees the reason and sends it again by hand',async()=>{
 const f=await fixture();try{
  await strict(f);draft(f,3,true);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'});
  await decide(f,'rejected','Фото не совпадают с адресом.');
  assert.match(notice(f,'owner','owner:review:%'),/Отправить на проверку снова/);
  assert.equal(await ensurePublishReview(f.owner,f.property),null);assert.equal(pending(f),undefined);
  let own=(await f.owner.roleState('owner')).ownProperties.find(p=>p.id===f.property);
  assert.equal(own.review_refused,'Фото не совпадают с адресом.');
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': «Test apartment»'});
  assert.ok(pending(f));
  own=(await f.owner.roleState('owner')).ownProperties.find(p=>p.id===f.property);
  assert.equal(own.review_refused,null);
 }finally{f.db.close();}
});
test('a moved flat: the guest keeps the agreed address until the new one is checked and accepted',async()=>{
 const f=await fixture();try{
  const ids=await shown(f);
  await f.owner.saveListing(f.property,body(f,{photos:ids,address:'Новая улица, 5'}));
  const card=async()=>(await f.guest.roleState('guest')).bookings.find(b=>b.id===f.booking);
  let b=await card();
  assert.equal(b.address,'PRIVATE ADDRESS');assert.deepEqual(b.address_change,{state:'review',next:null});
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'address_accept'}),/ещё проверяется/);
  // The right document proves one address: the new one needs it again before a person approves it.
  await ensurePublishReview(f.owner,f.property);
  await assert.rejects(decide(f,'approved'),/документ о праве/);
  rightDoc(f.db,f.property,'owner');await decide(f,'approved');
  assert.match(notice(f,'guest','guest:address-offered:%'),/проверен: Павлодар, Новая улица, 5\. Откройте бронь/);
  b=await card();
  assert.equal(b.address,'PRIVATE ADDRESS');assert.deepEqual(b.address_change,{state:'offered',next:'Павлодар, Новая улица, 5'});
  // The route and the AI still lead to the agreed address until the guest accepts.
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'address_accept'}),/принимает гость/);
  assert.match((await f.guest.bookingAction(f.booking,{action:'address_accept'})).message,/Новый адрес принят/);
  b=await card();assert.equal(b.address,'Новая улица, 5');assert.equal(b.address_change,undefined);
  assert.match(notice(f,'owner','owner:address-accepted:%'),/Гость принял новый адрес/);
 }finally{f.db.close();}
});
test('a guest who does not accept the new address cancels for free; a refused address keeps the agreed one',async()=>{
 const f=await fixture();try{
  const ids=await shown(f);
  await f.owner.saveListing(f.property,body(f,{photos:ids,address:'Новая улица, 5'}));
  await ensurePublishReview(f.owner,f.property);await decide(f,'rejected','Дом по адресу не найден.');
  assert.match(notice(f,'guest','guest:address-refused:%'),/согласованный адрес: Павлодар, PRIVATE ADDRESS/);
  const b=(await f.guest.roleState('guest')).bookings.find(b=>b.id===f.booking);
  assert.equal(b.address_change.state,'review');assert.equal(b.cancel_terms.withheld,0);
  await f.guest.bookingAction(f.booking,{action:'cancel'});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'cancelled');
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND body LIKE '%из-за смены адреса%'").get()?.body||'',/Гость отменил бронь из-за смены адреса/);
 }finally{f.db.close();}
});
test('a hotel: rooms added after the approval are shown too, and the guests of every room hear about a move',async()=>{
 const f=await fixture();try{
  const ids=await shown(f);
  const hotel=body(f,{photos:ids,details:{...body(f).details,type:'hotel'}});await f.owner.saveListing(f.property,hotel);
  await setRoomCount(f.owner,{propertyId:f.property,count:3});
  const rooms=f.db.raw.prepare('SELECT property_id FROM room_units WHERE lead_id=?').all(f.property).map(r=>r.property_id);
  assert.equal(rooms.length,2);for(const id of rooms)assert.equal(published(f,id),1,'a new room of a shown hotel is shown');
  // Two guests: the lead room is busy with the fixture's stay, so the next guests take rooms of their own.
  const start=Math.floor(now()/86400+5)*86400+9*3600,end=start+86400,taken=[];
  for(const key of ['a','b']){const {RentalService}=await load('service'),g=new RentalService(f.db,'g-'+key);await g.saveProfile({name:'Guest '+key,roles:['guest'],city:'Павлодар',contact:'test',districts:'Центр',experience:'Experienced',availability:'By agreement'});
   const id=(await g.createBooking({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'daily',requestKey:key,acceptTerms:true})).id;taken.push(f.db.raw.prepare('SELECT property_id FROM bookings WHERE id=?').get(id).property_id);}
  assert.ok(taken.some(id=>id!==f.property),'a guest is in another room');
  await f.owner.saveListing(f.property,body(f,{photos:ids,details:hotel.details,address:'Новая улица, 5'}));
  for(const g of ['guest','g-a','g-b'])assert.ok(notice(f,g,'guest:address:%'),g+' hears about the move');
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM booking_addresses').get().n,3);
 }finally{f.db.close();}
});
