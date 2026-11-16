// The third audit: closing a home that guests already booked, and a proposal to change the stay nobody answered.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {checkAdministratorOwner}=await load('administrator-runtime');
const notes=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').all(user,like).map(n=>n.body);

test('closing a home with a booked stay asks the owner what to do with it',async()=>{
 const f=await fixture();try{
  await f.owner.bookingAction(f.booking,{action:'paid'});
  await assert.rejects(f.owner.readinessAction(f.property,{readiness:'maintenance',note:'Ремонт'}),e=>e.status===409&&/есть брони: 1, ближайший заезд/.test(e.message));
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations').get().readiness,'inspection','nothing changed without the decision');
  const kept=await f.owner.readinessAction(f.property,{readiness:'maintenance',note:'Ремонт',bookings:'keep'});
  assert.match(kept.message,/Броней в силе: 1.*Жильё готово/);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'confirmed');
 }finally{f.db.close();}
});

test('closing with «cancel» cancels the stays by the owner\'s rule: the guest gets everything back and hears it',async()=>{
 const f=await fixture();try{
  await f.owner.bookingAction(f.booking,{action:'paid'});
  const r=await f.owner.readinessAction(f.property,{readiness:'blocked',note:'Владелец временно закрыл заезды.',bookings:'cancel'});
  assert.match(r.message,/Отменено броней: 1/);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'cancelled');
  assert.equal(f.db.raw.prepare('SELECT refund_due FROM booking_terms WHERE booking_id=?').get(f.booking).refund_due,4000);
  assert.ok(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest'").all().some(n=>/Владелец отменил бронь.*вернут всю оплату: 4 000 ₸/.test(n.body)));
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations').get().readiness,'blocked');
  // A home with no stays ahead closes in one tap, as before.
  await f.owner.readinessAction(f.property,{readiness:'maintenance',note:'Ремонт'});
 }finally{f.db.close();}
});

async function propose(f,hours,key){
 const body={start:iso(f.db.raw.prepare('SELECT start FROM bookings WHERE id=?').get(f.booking).start),end:iso(f.db.raw.prepare('SELECT start FROM bookings WHERE id=?').get(f.booking).start+hours*3600),billingMode:'hourly'};
 const q=await f.guest.bookingChangeQuote(f.booking,'guest',body);
 return f.guest.proposeBookingChange(f.booking,'guest',{...body,requestKey:key,expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true,reason:'Планы изменились'});
}

test('a proposal nobody answered expires with a word to both sides',async()=>{
 const f=await fixture();try{
  const r=await propose(f,3,'longer');assert.match(r.message,/ответ ждём 15 мин/);
  const row=f.db.raw.prepare('SELECT expires_at-created_at ttl FROM booking_changes WHERE id=?').get(r.id);assert.equal(row.ttl,900);
  f.db.raw.prepare('UPDATE booking_changes SET expires_at=? WHERE id=?').run(now()-5,r.id);
  await checkAdministratorOwner(f.db,'owner');
  assert.equal(f.db.raw.prepare('SELECT status FROM booking_changes WHERE id=?').get(r.id).status,'expired');
  assert.match(notes(f,'guest','%change-expired:%')[0],/не ответили вовремя.*прежние даты/);
  assert.match(notes(f,'owner','%change-expired:%')[0],/истекло без ответа/);
 }finally{f.db.close();}
});

test('a stay paid for more than the new price is not shortened: the guest hears why before the owner is asked (as before)',async()=>{
 const f=await fixture();try{
  const longer=await propose(f,3,'longer');await f.owner.decideBookingChange(f.booking,longer.id,'owner',{action:'accept'});
  f.db.raw.prepare("UPDATE booking_terms SET paid_amount=6000 WHERE booking_id=?").run(f.booking);
  await assert.rejects(propose(f,2,'shorter'),e=>e.status===409&&/Новая сумма меньше подтверждённой оплаты/.test(e.message));
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM booking_changes WHERE status='pending'").get().n,0);
 }finally{f.db.close();}
});

// The fourth audit: a request for a home that is not ready, with the arrival close.
const {unreadyNote,SOON}=await load('unready');
async function request(f,inSeconds){
 await f.owner.bookingAction(f.booking,{action:'cancel',reason:'Тест'});
 return (await f.guest.createBooking({propertyId:f.property,start:iso(now()+inSeconds),end:iso(now()+inSeconds+7200),guests:1,billingMode:'hourly',requestKey:'second',acceptTerms:true})).id;
}

test('the note names the state and the time, and is empty for a ready home or a far arrival',()=>{
 assert.equal(unreadyNote('awaiting_cleaning',1000+7200,1000),'Жильё ждёт уборки, а заезд через 2 ч');
 assert.equal(unreadyNote('inspection',1000+1500,1000),'Жильё не отмечено готовым, а заезд через 25 мин');
 assert.equal(unreadyNote('ready',1000+60,1000),'');assert.equal(unreadyNote('occupied',1000+60,1000),'');
 assert.equal(unreadyNote('cleaning',1000+SOON+60,1000),'');
});

test('a request for a home not ready soon tells the owner so, in the notice and in the card',async()=>{
 const f=await fixture();try{
  const id=await request(f,2*3600);
  assert.match(notes(f,'owner','%booking:'+id+'%')[0],/Жильё не отмечено готовым, а заезд через 2 ч\. Подтвердите/);
  const {approvalCards}=await load('approvals'),card=approvalCards(await f.owner.state(),'owner','owner',now()).find(c=>c.entityId===id);
  assert.match(card.unready,/не отмечено готовым/);assert.ok(card.facts.some(([l])=>l==='Готовность'));
 }finally{f.db.close();}
});

test('the autopilot does not confirm such a request alone, and confirms it once the home is ready',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE property_policies SET auto_confirm=1,auto_assign=1').run();
  const id=await request(f,2*3600),status=()=>f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(id).status;
  assert.match(notes(f,'owner','%booking:'+id+'%')[0],/ИИ-администратор не подтвердил заявку .* сам: .*Жильё не отмечено готовым/i);
  f.db.raw.prepare('DELETE FROM booking_risks').run(); // only the readiness holds it now
  await checkAdministratorOwner(f.db,'owner');assert.equal(status(),'requested');
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();f.release();
  await checkAdministratorOwner(f.db,'owner');assert.equal(status(),'confirmed');
 }finally{f.db.close();}
});

test('a guest the autopilot would confirm at once is not confirmed while the home is not ready',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE property_policies SET auto_confirm=1,auto_assign=1').run();
  f.db.raw.prepare("INSERT INTO phone_verifications VALUES ('guest','+77000000009','x',0,0,0,?)").run(now());
  f.db.raw.prepare("UPDATE profiles SET created_at=? WHERE id='guest'").run(now()-90*86400);
  const id=await request(f,5*3600);
  assert.notEqual(f.db.raw.prepare('SELECT level FROM booking_risks WHERE booking_id=?').get(id).level,'high');
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(id).status,'requested');
  assert.match(notes(f,'owner','%booking:'+id+'%')[0],/не подтвердил заявку .* сам: жильё не отмечено готовым/);
  // The same guest and a ready home: confirmed at once, as before.
  await f.owner.bookingAction(id,{action:'cancel',reason:'Тест'});f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
  const again=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+5*3600),end:iso(now()+7*3600),guests:1,billingMode:'hourly',requestKey:'third',acceptTerms:true})).id;
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(again).status,'confirmed');
 }finally{f.db.close();}
});
