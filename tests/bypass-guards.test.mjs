import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {phoneOpens}=await load('chat-guard'),{withRepeatDiscount}=await load('rental-policy'),{hasContactWays}=await load('listing-rules');
const {bypassSuspects,digestText,digestFacts}=await load('admin-digest');

// Deals taken out of the service (2026-11-22): the phone opens a day before the check-in, profiles carry no contacts,
// the administrator sees confirmed bookings cancelled again and again, and a regular guest gets the owner's discount.
test('the phone of a confirmed booking opens a day before the check-in',()=>{
 const t=now();
 assert.equal(phoneOpens({status:'requested',start:t+60},t),false);
 assert.equal(phoneOpens({status:'confirmed',start:t+2*86400},t),false);
 assert.equal(phoneOpens({status:'confirmed',start:t+86400},t),true);
 assert.equal(phoneOpens({status:'completed',start:t-5*86400},t),true);
 assert.equal(phoneOpens({status:'cancelled',start:t+60},t),false);
});
test('the owner sees the guest phone only a day before the check-in, and the guest the owner contact',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE profiles SET contact='+7 701 111 22 33' WHERE id='guest'").run();
  const row=async(s,role)=>(await s.roleState(role,{catalog:false})).bookings.find(b=>b.id===f.booking);
  R.prepare("UPDATE bookings SET status='requested',start=?,end=?+7200,occupied_until=?+14400 WHERE id=?").run(now()+3*86400,now()+3*86400,now()+3*86400,f.booking);
  assert.equal((await row(f.owner,'owner')).guest_contact,null,'a request does not show the guest phone');
  R.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(f.booking);
  assert.equal((await row(f.owner,'owner')).guest_contact,null,'confirmed, but the check-in is days away');
  assert.equal((await row(f.guest,'guest')).owner_contact,null);
  R.prepare('UPDATE bookings SET start=?,end=?+7200,occupied_until=?+14400 WHERE id=?').run(now()+3600,now()+3600,now()+3600,f.booking);
  assert.equal((await row(f.owner,'owner')).guest_contact,'+7 701 111 22 33');
  assert.equal((await row(f.guest,'guest')).owner_contact,'test');
 }finally{f.db.close();}
});
test('a profile others read carries no phone, link or messenger',async()=>{
 for(const text of ['WhatsApp 87011234567','пишите в телеграм','@cleaner_kz','8 7 0 1 1 2 3 4 5 6 7','www.example.kz'])assert.equal(hasContactWays(text),true,text);
 for(const text of ['Убираю 5 лет, без предоплаты','Пн–Пт с 9:00 до 18:00','Центр, Усолка'])assert.equal(hasContactWays(text),false,text);
 const f=await fixture();try{
  const p=await f.cleaner.profile(),body={name:p.name,contact:p.contact,city:p.city,districts:p.districts,experience:p.experience,availability:p.availability,workStatus:'available',avatarId:p.avatar_id,expectedVersion:p.profile_version};
  await assert.rejects(f.cleaner.editProfile({...body,bio:'Звоните 8 701 123 45 67'}),e=>e.status===422&&/Уберите из профиля телефон/.test(e.message));
  await assert.rejects(f.cleaner.editProfile({...body,experience:'Опыт 3 года, пишите в WhatsApp'}),/Уберите из профиля/);
  await f.cleaner.editProfile({...body,bio:'Аккуратно и в срок'});
  await assert.rejects(f.cleaner.saveProfile({name:'Cleaner',contact:'test',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'Звоните 87011234567',availability:'Пн–Пт'}),/Уберите из профиля/);
 }finally{f.db.close();}
});
test('the morning summary names owners whose confirmed bookings are cancelled again and again',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  assert.deepEqual(await bypassSuspects(f.db),[]);
  const add=(id)=>{R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,'guest',?,?,?,1,10000,'cancelled',0,'unpaid',?,?)").run(id,f.property,now()+86400,now()+2*86400,now()+2*86400,id,now());
   R.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at) VALUES (?,'owner',?,10000,400,400,'shadow',1,?)").run(id,f.property,now());};
  add('c1');assert.deepEqual(await bypassSuspects(f.db),[],'one cancellation is not a pattern');
  add('c2');const list=await bypassSuspects(f.db);
  assert.equal(list.length,1);assert.equal(list[0].owner_id,'owner');assert.equal(list[0].n,2);
  assert.match(digestText(await digestFacts(f.db)),/сделок в обход: .*Owner \(2\)/);
 }finally{f.db.close();}
});
test('a regular guest gets the owner discount, a new guest pays the full price',async()=>{
 assert.deepEqual(withRepeatDiscount({periods:2,price:10000,amount:20000},10),{periods:2,price:9000,amount:18000,repeat:{percent:10,regular:10000}});
 assert.deepEqual(withRepeatDiscount({periods:2,price:10000,amount:20000},0),{periods:2,price:10000,amount:20000});
 const f=await fixture(),R=f.db.raw;try{
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,repeatDiscount:10});
  await assert.rejects(f.owner.savePolicy(f.property,{...f.policy,expectedVersion:2,repeatDiscount:12}),/скидку постоянного гостя/);
  const ask={propertyId:f.property,start:iso(now()+10*86400),end:iso(now()+12*86400),guests:1,billingMode:'daily'};
  const first=await f.guest.bookingQuote(ask);
  assert.equal(first.repeat,undefined,'no stay yet');assert.equal(first.amount,20000);
  R.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  const again=await f.guest.bookingQuote(ask);
  assert.deepEqual(again.repeat,{percent:10,regular:10000});assert.equal(again.price,9000);assert.equal(again.amount,18000);
  assert.equal((await f.other.bookingQuote(ask)).repeat,undefined,'another guest without a stay');
  const booked=await f.guest.createBooking({...ask,requestKey:'again',acceptTerms:true,expectedAmount:18000});
  assert.equal(R.prepare('SELECT amount FROM bookings WHERE id=?').get(booked.id).amount,18000);
  // The discount stays with the booking: a longer stay costs 3 × 9 000, not 3 × 10 000.
  assert.equal(R.prepare('SELECT discount_percent FROM booking_terms WHERE booking_id=?').get(booked.id).discount_percent,10);
  await f.owner.bookingAction(booked.id,{action:'confirm',cleaningFee:3000});
  const longer=await f.guest.bookingChangeQuote(booked.id,'guest',{start:ask.start,end:iso(now()+13*86400)});
  assert.equal(longer.amount,27000);
 }finally{f.db.close();}
});
test('after a cancelled confirmed booking the guest is asked once whether they stayed; a «yes» reaches the morning summary',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const card=async()=>(await f.guest.roleState('guest',{catalog:false})).approvals.find(c=>c.kind==='stay-check');
  R.prepare("UPDATE bookings SET status='cancelled',start=?,end=?,occupied_until=? WHERE id=?").run(now()-7200,now()-3600,now()-1800,f.booking);
  assert.ok(R.prepare('SELECT 1 FROM platform_commissions WHERE booking_id=?').get(f.booking),'the booking was confirmed first');
  const c=await card();assert.equal(c.title,'Вы заселились?');assert.equal(c.canDecide,true);
  assert.equal((await f.owner.roleState('owner',{catalog:false})).approvals.some(a=>a.kind==='stay-check'),false,'the owner is not asked');
  assert.equal((await f.owner.roleState('owner',{catalog:false})).bookings.find(b=>b.id===f.booking).stay_check,0,'the owner does not see it');
  await f.guest.decideApproval('guest',{id:c.id,revision:c.revision,action:'accept'});
  assert.equal(await card(),undefined,'asked once');
  assert.match(digestText(await digestFacts(f.db)),/жили по отменённой брони: Owner \(1\)/);
 }finally{f.db.close();}
});
test('before the phone opens a prepaying guest gets the Kaspi link without the number, when the owner gave a link',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("INSERT OR REPLACE INTO payout_details(user_id,phone,recipient,link,updated_at) VALUES ('owner','+77011234567','Owner O.','https://pay.kaspi.kz/pay/abc',0)").run();
  R.prepare('UPDATE booking_terms SET prepay_percent=50 WHERE booking_id=?').run(f.booking);
  R.prepare('UPDATE bookings SET start=?,end=?+7200,occupied_until=?+14400 WHERE id=?').run(now()+3*86400,now()+3*86400,now()+3*86400,f.booking);
  const pay=async()=>(await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking).owner_pay;
  assert.deepEqual([(await pay()).phone,(await pay()).link],['','https://pay.kaspi.kz/pay/abc']);
  R.prepare('UPDATE bookings SET start=?,end=?+7200,occupied_until=?+14400 WHERE id=?').run(now()+3600,now()+3600,now()+3600,f.booking);
  assert.equal((await pay()).phone,'+77011234567');
 }finally{f.db.close();}
});
test('the administrator sees who looks like dealing outside the service and warns in steps: warning, second warning, block',async()=>{
 const {bypassWatch}=await load('bypass-watch'),{readPlatformAdmin,writePlatformAdmin}=await load('platform-admin'),{openDiscussion,sendDiscussionMessage}=await load('process-discussions');
 const f=await fixture(),R=f.db.raw,admin={PLATFORM_ADMIN_IDS:'guest'};try{
  assert.deepEqual(await bypassWatch(f.db),[]);
  const cancel=(id,t=now())=>{R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,'guest',?,?,?,1,10000,'cancelled',0,'unpaid',?,?)").run(id,f.property,now()+86400,now()+2*86400,now()+2*86400,id,t);
   R.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at) VALUES (?,'owner',?,10000,400,400,'shadow',1,?)").run(id,f.property,t);};
  const job=(id)=>R.prepare("INSERT INTO cleaning_jobs(id,property_id,owner_id,start,end,fee,description,status,assigned_to,created_at,cancelled_at) VALUES (?,?,'owner',?,?,3000,'x','cancelled','cleaner',?,?)").run(id,f.property,now()+86400,now()+90000,now(),now());
  cancel('c1');assert.deepEqual(await bypassWatch(f.db),[],'one cancellation is not a sign');
  // A link in the booking chat is refused, and the attempt is written down.
  const room=await openDiscussion(f.owner,'owner',{kind:'booking',entityId:f.booking});
  await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,text:'Пишите https://wa.me/77011234567',requestKey:'k1'}),e=>e.status===422);
  assert.ok(R.prepare("SELECT 1 FROM audit_events WHERE action='chat.contact_blocked' AND actor_id='owner'").get());
  cancel('c2');job('j1');job('j2');
  const {items}=await readPlatformAdmin(f.guest,'bypass',{},admin);
  const owner=items.find(p=>p.userId==='owner'),cleaner=items.find(p=>p.userId==='cleaner');
  assert.deepEqual(owner.signals,{cancels:2,stayed:0,contacts:1,jobs:2});assert.equal(owner.warnings,0);assert.equal(owner.role,'owner');
  assert.equal(cleaner.role,'cleaner');assert.equal(cleaner.signals.jobs,2);
  await assert.rejects(writePlatformAdmin(f.owner,'bypass/warn',{userId:'owner',warnings:0},admin),e=>e.status===403);
  assert.match((await writePlatformAdmin(f.guest,'bypass/warn',{userId:'owner',warnings:0},admin)).message,/Первое/);
  await assert.rejects(writePlatformAdmin(f.guest,'bypass/warn',{userId:'owner',warnings:0},admin),/обновите/,'a second tap does not warn twice');
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe='service:bypass-warning:owner:1'").get().body,/Предупреждение администратора/);
  assert.ok((await f.owner.roleState('owner',{catalog:false})).notifications.some(n=>n.dedupe==='service:bypass-warning:owner:1'),'the owner sees the warning');
  // After a warning the count starts again: the owner comes back only if it goes on.
  assert.equal((await bypassWatch(f.db)).some(p=>p.userId==='owner'),false);
  assert.equal((await bypassWatch(f.db)).some(p=>p.userId==='cleaner'),true,'the cleaner was not warned');
  cancel('c3',now()+5);cancel('c4',now()+5);
  const again=(await bypassWatch(f.db,now()+10)).find(p=>p.userId==='owner');assert.equal(again.warnings,1);assert.equal(again.signals.cancels,2);
  assert.match((await writePlatformAdmin(f.guest,'bypass/warn',{userId:'owner',warnings:1},admin)).message,/Второе/);
  await assert.rejects(writePlatformAdmin(f.guest,'bypass/warn',{userId:'owner',warnings:2},admin),/блокировка/);
  await writePlatformAdmin(f.guest,'restrictions/decide',{userId:'cleaner',action:'block',reason:'Обход сервиса после двух предупреждений.'},admin);
  assert.equal((await bypassWatch(f.db)).some(p=>p.userId==='cleaner'),false,'a blocked account leaves the list');
 }finally{f.db.close();}
});
