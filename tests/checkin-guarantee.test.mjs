import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
// «Гарантия заселения» (2026-11-27): not let in, ten minutes for the owner, then a place nearby no dearer, confirmed at once.
const {guaranteeState,switchStay,GUARANTEE_WAIT}=await load('checkin-guarantee');
const {RentalService}=await load('service');
const HOME=[76.9500,52.2870];
const policy={expectedVersion:0,dailyPrice:9000,hourlyPrice:2000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Без курения',autoConfirm:true,autoAssign:false,cleaningFee:0,cleaningBudget:0};
// A place of another owner: ready now, with its pin `metres` east of the first home.
async function place(f,owner,title,{price=9000,metres=600,instant=true}={}){
 const s=new RentalService(f.db,owner);
 if(!f.db.raw.prepare('SELECT 1 FROM profiles WHERE id=?').get(owner))await s.saveProfile({name:title,roles:['owner'],city:'Павлодар',contact:'test'});
 const id=(await s.createProperty({title,city:'Павлодар',district:'Центр',address:title+' 1',description:'Test',price,rooms:1,capacity:2,cleaningMinutes:60})).id;
 await s.savePolicy(id,{...policy,dailyPrice:price,autoConfirm:instant});
 const R=f.db.raw;R.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(id);
 R.prepare("INSERT INTO property_locations VALUES (?,?,?,'owner',?,1,?)").run(id,HOME[0]+metres/68000,HOME[1],'Павлодар|Центр|'+title+' 1',now());
 return id;
}
// The guest's daily stay started five minutes ago, paid, and nobody opens the door.
async function atTheDoor(f,why='no_answer'){
 const R=f.db.raw;
 R.prepare("UPDATE bookings SET start=?,end=?,occupied_until=?,amount=10000 WHERE id=?").run(now()-300,now()+20*3600,now()+21*3600,f.booking);
 R.prepare("UPDATE booking_terms SET billing_mode='daily',rate=10000,units=1,amount=10000,paid_amount=10000 WHERE booking_id=?").run(f.booking);
 R.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);
 R.prepare("INSERT INTO property_locations VALUES (?,?,?,'owner','Павлодар|Центр|PRIVATE ADDRESS',1,?)").run(f.property,HOME[0],HOME[1],now());
 return f.guest.bookingAction(f.booking,{action:'not_let_in',reason:why});
}
const later=(f,seconds)=>f.db.raw.prepare('UPDATE checkin_guarantees SET reported_at=reported_at-? WHERE booking_id=?').run(seconds,f.booking);

test('the owner has ten minutes; then up to three places nearby, no dearer, that confirm at once',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const near=await place(f,'other','Студия Лермонтова',{price:9000,metres:600});
  await place(f,'third','Квартира Кутузова',{price:10000,metres:1200});
  await place(f,'third','Дорогая',{price:15000,metres:300});
  await place(f,'third','Далеко',{price:8000,metres:9000});
  await place(f,'fourth','По заявке',{price:8000,metres:400,instant:false});
  assert.deepEqual(await guaranteeState(f.guest,f.booking),{reported:false});
  const said=await atTheDoor(f,'key');
  assert.match(said.message,/10 минут/);
  assert.match(R.prepare("SELECT description FROM administrator_issues WHERE entity_id=?").get(f.booking).description,/^Меня не заселили\. Ключ или код не подходит\./);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe=?").get('owner:not-let-in:'+f.booking).body,/не может заселиться.*10 минут/);
  const wait=await guaranteeState(f.guest,f.booking);
  assert.equal(wait.step,'waiting');assert.equal(wait.waitUntil-wait.reportedAt,GUARANTEE_WAIT);assert.deepEqual(wait.options,[]);
  await assert.rejects(switchStay(f.guest,{bookingId:f.booking,propertyId:near}),/через 10 минут/);
  // Within the ten minutes leaving still costs what the rules say.
  assert.ok((await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking).cancel_terms.withheld>0);
  // The owner answers in the chat: the guest sees it, the guarantee keeps going until someone is inside.
  R.prepare("INSERT INTO discussion_rooms VALUES ('room','booking',?,'stay','k','[]','t',?)").run(f.booking,now());
  R.prepare("INSERT INTO discussion_messages(room_id,sender_id,sender_role,body,request_key,created_at) VALUES ('room','owner','owner','Иду',?,?)").run('m1',now());
  assert.equal(typeof (await guaranteeState(f.guest,f.booking)).ownerAnsweredAt,'number');
  later(f,GUARANTEE_WAIT);
  const open=await guaranteeState(f.guest,f.booking);
  assert.equal(open.step,'options');
  assert.deepEqual(open.options.map(o=>[o.title,o.amount,o.distance,o.deposit]),[['Студия Лермонтова',9000,600,0],['Квартира Кутузова',10000,1200,0]]);
  // Another guest's own booking and the owner's other side never see it.
  await assert.rejects(guaranteeState(f.owner,f.booking),e=>e.status===404);
  // The card already says leaving is free now.
  const card=(await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking);
  assert.equal(card.guarantee.reason,'key');assert.deepEqual([card.cancel_terms.refund,card.cancel_terms.withheld],[10000,0]);
 }finally{f.db.close();}
});

test('picking a place books it confirmed and cancels the first by the owner\'s terms',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const near=await place(f,'other','Студия Лермонтова',{price:9000,metres:600});
  await atTheDoor(f);later(f,GUARANTEE_WAIT);const paid=10000;
  await assert.rejects(switchStay(f.guest,{bookingId:f.booking,propertyId:near,shownAmount:8000}),/Цена изменилась/);
  const r=await switchStay(f.guest,{bookingId:f.booking,propertyId:near,shownAmount:9000});
  assert.match(r.message,/подтверждена\. Первая бронь отменена, владелец вернёт вам 10 000 ₸/);
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(r.bookingId).status,'confirmed');
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'cancelled');
  // A full refund, by the owner, with the usual reminders.
  assert.equal(R.prepare('SELECT refund_due FROM booking_terms WHERE booking_id=?').get(f.booking).refund_due,paid);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe=?").get('owner:cancelled:'+f.booking).body,/Гостя не заселили.*Верните гостю всю оплату: 10 000 ₸/);
  const state=await guaranteeState(f.guest,f.booking);
  assert.equal(state.step,'moved');assert.equal(state.moved.bookingId,r.bookingId);
  const cards=(await f.guest.roleState('guest',{catalog:false})).bookings,moved=cards.find(b=>b.id===r.bookingId);
  assert.equal(moved.replaces.bookingId,f.booking);assert.equal(moved.replaces.refund,paid);
  await assert.rejects(switchStay(f.guest,{bookingId:f.booking,propertyId:near}),/уже выбрана/);
 }finally{f.db.close();}
});

test('two taps on the same place keep the one replacement, and a place with no pin is not offered',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const near=await place(f,'other','Студия Лермонтова',{price:9000,metres:600});
  const lost=await place(f,'third','Без точки',{price:8000,metres:300});
  await atTheDoor(f);later(f,GUARANTEE_WAIT);
  R.prepare('DELETE FROM property_locations WHERE property_id=?').run(lost);
  assert.deepEqual((await guaranteeState(f.guest,f.booking)).options.map(o=>o.title),['Студия Лермонтова']);
  // The guest taps twice before the first answer comes back: one tap books, the other is told to wait.
  const taps=await Promise.allSettled([switchStay(f.guest,{bookingId:f.booking,propertyId:near}),switchStay(f.guest,{bookingId:f.booking,propertyId:near})]);
  const won=taps.filter(t=>t.status==='fulfilled'),refused=taps.filter(t=>t.status==='rejected');
  assert.equal(won.length,1);assert.equal(refused.length,1);assert.match(refused[0].reason.message,/уже бронируется/);
  const made=won[0].value.bookingId;
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(made).status,'confirmed');
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'cancelled');
  assert.deepEqual({...R.prepare('SELECT replaced_by,switching_at FROM checkin_guarantees WHERE booking_id=?').get(f.booking)},{replaced_by:made,switching_at:null});
  assert.equal(R.prepare("SELECT COUNT(*) n FROM bookings WHERE property_id=? AND status<>'cancelled'").get(near).n,1);
 }finally{f.db.close();}
});

test('without the pin of the booked home no place is offered as nearby',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  await place(f,'other','Студия Лермонтова',{price:9000,metres:600});
  await atTheDoor(f);later(f,GUARANTEE_WAIT);
  R.prepare('DELETE FROM property_locations WHERE property_id=?').run(f.property);
  assert.deepEqual((await guaranteeState(f.guest,f.booking)).options,[]);
 }finally{f.db.close();}
});

test('no replacement once the guest is inside, and the guest\'s plain cancel follows the same terms',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const near=await place(f,'other','Студия Лермонтова');
  await atTheDoor(f);later(f,GUARANTEE_WAIT);
  // The owner came: the guest says «Я заселился».
  R.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now(),f.booking);
  assert.equal((await guaranteeState(f.guest,f.booking)).step,'inside');
  await assert.rejects(switchStay(f.guest,{bookingId:f.booking,propertyId:near}),/заселились/);
  R.prepare('UPDATE booking_terms SET checkin_reported_at=NULL WHERE booking_id=?').run(f.booking);
  // Not inside and no place picked: cancelling is free, as the owner's cancel.
  const c=await f.guest.bookingAction(f.booking,{action:'cancel'});
  assert.deepEqual([c.cancel.refund,c.cancel.withheld],[10000,0]);
 }finally{f.db.close();}
});

test('a place that would not confirm at once is let go and the first booking stays',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const near=await place(f,'other','Студия Лермонтова');
  await atTheDoor(f);later(f,GUARANTEE_WAIT);
  // Its owner switched the autopilot off a moment before the guest picked it.
  R.prepare('UPDATE property_policies SET auto_confirm=0 WHERE property_id=?').run(near);
  await assert.rejects(switchStay(f.guest,{bookingId:f.booking,propertyId:near}),/уже заняли/);
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'confirmed');
  assert.equal(R.prepare("SELECT COUNT(*) n FROM bookings WHERE property_id=?").get(near).n,0);
  // A hall or a bath has no replacement: the report still goes to the owner and the administrator.
  R.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,'{\"type\":\"sauna\"}','r',?) ON CONFLICT(property_id) DO UPDATE SET details=json_set(details,'$.type','sauna')").run(f.property,now());
  R.prepare('UPDATE property_policies SET auto_confirm=1 WHERE property_id=?').run(near);
  assert.deepEqual((await guaranteeState(f.guest,f.booking)).options,[]);
 }finally{f.db.close();}
});
