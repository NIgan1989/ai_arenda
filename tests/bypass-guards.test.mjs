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
