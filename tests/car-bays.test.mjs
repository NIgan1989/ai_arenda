import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';

// «Запись и живая очередь» of a car wash (2026-11-28): some boxes take bookings, the rest are the queue marked by the
// person on shift; the guest sees the load from those taps, and nothing pretends to be known when nobody taps.
const listing=(details={})=>({title:'Автомойка у дома',city:'Павлодар',district:'Центр',address:'PRIVATE PLACE ADDRESS',description:'Мойка кузова и салона, три бокса, зона ожидания и кофе для гостей. Приезжайте вовремя.',price:60000,rooms:1,capacity:1,cleaningMinutes:30,photos:[],published:false,
 details:{type:'carwash',area:80,beds:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:[],pets:false,smoking:false,parties:false,...details},
 rental:{hourlyPrice:5000,minHours:1,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Приезжайте вовремя.',includedGuests:0,extraGuestPrice:0}});
const tomorrow=hour=>{const day=Math.floor((now()+5*3600)/86400)*86400+86400;return day-5*3600+hour*3600;};
const guestNamed=async(f,id)=>{const {RentalService}=await load('service');const g=new RentalService(f.db,id);await g.saveProfile({name:'Guest '+id,roles:['guest'],city:'Павлодар',contact:'test',districts:'Центр',experience:'Experienced',availability:'By agreement'});return g;};

async function wash(f,details){
 const {SERVICE_STARTERS}=await load('venue-services'),{setRoomCount}=await load('room-units');
 const id=(await f.owner.saveListing(null,listing({services:SERVICE_STARTERS.carwash,...details}))).id;
 f.db.raw.prepare('UPDATE properties SET published=1').run();f.db.raw.prepare("UPDATE property_operations SET readiness='ready'").run();
 // Round the clock, so the load is shown whatever the hour the test runs at.
 f.db.raw.prepare("UPDATE property_policies SET venue_hours='{\"open\":0,\"close\":1440,\"sessions\":[]}' WHERE property_id=?").run(id);
 await setRoomCount(f.owner,{propertyId:id,count:3});
 return id;
}

test('the plan of a card: bookings in the first boxes, the rest the queue, self-service takes none',async()=>{
 const {bayPlan,bayInput,waitMinutes,bayLines}=await load('bay-plan');
 assert.deepEqual(bayPlan({},4),{selfService:false,booked:4,lateMinutes:10,instant:true,showLoad:true});
 assert.equal(bayPlan({bookedBays:1},4).booked,1);
 assert.equal(bayPlan({bookedBays:9},4).booked,4);
 assert.equal(bayPlan({selfService:true,bookedBays:2},4).booked,0);
 assert.deepEqual(bayInput({bookedBays:'2',lateMinutes:15,instantConfirm:false}),{bookedBays:2,lateMinutes:15,instantConfirm:false});
 assert.deepEqual(bayInput({lateMinutes:7}),{});
 // Two queue boxes, one free and nobody waiting: no wait; three waiting with 30-minute washes: 30 minutes.
 assert.equal(waitMinutes(1,0,2,30),0);
 assert.equal(waitMinutes(0,3,2,30),60);
 const load0={total:4,booked:1,queue:3,open:3,free:2,waiting:0,waitMinutes:0,next:null,known:true,stale:false,selfService:false,working:true};
 assert.deepEqual(bayLines(load0),['Свободно сейчас: 2 из 3','По записи: сегодня мест нет']);
 assert.deepEqual(bayLines({...load0,known:false,stale:true}),['Загрузка не обновлялась','По записи: сегодня мест нет']);
 assert.deepEqual(bayLines({...load0,booked:0,selfService:true,known:false,stale:true}),['Самообслуживание · 4 поста']);
});

test('one box by booking: a second booking at the same time is refused, the booking is confirmed at once',async()=>{
 const f=await fixture();try{
  const id=await wash(f,{bookedBays:1});
  const start=tomorrow(10),day=Math.floor((start+18000)/86400)*86400-18000;
  const slots=await f.guest.serviceSlots({propertyId:id,service:'Кузов',day});
  assert.ok(slots.starts.includes(start));
  const first=await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов',car:'Toyota Camry 123ABC01',requestKey:'a',acceptTerms:true});
  const row=f.db.raw.prepare('SELECT property_id,status FROM bookings WHERE id=?').get(first.id);
  assert.equal(row.property_id,id,'the first box takes bookings');
  assert.equal(row.status,'confirmed','«Подтверждать запись сразу» is on by default');
  // The two queue boxes are free, but they take no bookings.
  await assert.rejects((await guestNamed(f,'g-b')).createBooking({propertyId:id,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов',car:'Kia Rio 777AAA01',requestKey:'b',acceptTerms:true}),/занят/);
  assert.ok(!(await f.guest.serviceSlots({propertyId:id,service:'Кузов',day})).starts.includes(start));
 }finally{f.db.close();}
});

test('a wash of the live queue only takes no bookings, and self-service says so',async()=>{
 const f=await fixture();try{
  const id=await wash(f,{bookedBays:0}),start=tomorrow(10);
  await assert.rejects(f.guest.bookingQuote({propertyId:id,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов'}),/только живая очередь/);
  const self=await wash(f,{selfService:true});
  await assert.rejects(f.guest.bookingQuote({propertyId:self,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов'}),/самообслуживания/);
 }finally{f.db.close();}
});

test('the person on shift marks the boxes and the queue; the guest sees the load, and «не обновлялась» after half an hour',async()=>{
 const f=await fixture();try{
  const {bayLoad,bayMark,bayWaiting,bayPosts}=await load('bays'),{assignStaff}=await load('staff');
  const id=await wash(f,{bookedBays:1});
  // Nobody has tapped yet: the guest is told the load is not known.
  let l=await bayLoad(f.db,id);
  assert.equal(l.stale,true);assert.equal(l.queue,2);assert.equal(l.booked,1);
  const card=(await f.guest.publicCatalog()).properties.find(p=>p.id===id);
  assert.equal(card.bays.stale,true,'the catalog carries the load');
  // Two admins on shift, named by phone.
  const {RentalService}=await load('service');
  for(const [who,phone] of [['admin-1','+77010000001'],['admin-2','+77010000002']]){
   f.db.raw.prepare("INSERT INTO profiles(id,name,created_at) VALUES (?,?,0) ON CONFLICT(id) DO NOTHING").run(who,who);
   f.db.raw.prepare("INSERT INTO auth_accounts(id,name,phone,password_hash,recovery_hash,created_at) VALUES (?,?,?,'x','x',0) ON CONFLICT(id) DO NOTHING").run(who,who,phone);
   await assignStaff(f.owner,{propertyId:id,phone});
  }
  assert.equal(f.db.raw.prepare('SELECT COUNT(DISTINCT staff_id) n FROM property_staff WHERE property_id=?').get(id).n,2);
  const admin=new RentalService(f.db,'admin-2'),posts=await bayPosts(f.db,id);
  const queue=posts.bays.filter(b=>b.mode==='queue');
  assert.equal(queue.length,2);
  // Two cars wait; one goes into the first queue box.
  await bayWaiting(admin,{propertyId:id,delta:2});
  await bayMark(admin,{propertyId:queue[0].id,action:'in'});
  l=await bayLoad(f.db,id);
  assert.equal(l.stale,false);assert.equal(l.waiting,1,'a car from the queue took the box');assert.equal(l.free,1);
  await bayMark(admin,{propertyId:queue[1].id,action:'in'});
  l=await bayLoad(f.db,id);
  assert.equal(l.free,0);assert.ok(l.waitMinutes>0);
  // Half an hour without taps: the load is not shown as known any more.
  l=await bayLoad(f.db,id,now()+31*60);
  assert.equal(l.stale,true);
  // Someone not named sees nothing.
  await assert.rejects(bayMark(new RentalService(f.db,'stranger'),{propertyId:queue[0].id,action:'out'}),/недоступен/);
 }finally{f.db.close();}
});

test('«Не приехал»: after the wait the booking is closed as a no-show and counts against the guest',async()=>{
 const f=await fixture();try{
  const {bayNoShow}=await load('bays'),{reliabilityFor}=await load('reliability');
  const id=await wash(f,{bookedBays:1,lateMinutes:10}),start=tomorrow(10);
  const b=await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов',car:'Toyota Camry 123ABC01',requestKey:'a',acceptTerms:true});
  await assert.rejects(bayNoShow(f.owner,{bookingId:b.id}),/через 10 минут/);
  // Move the booking into the past: started 15 minutes ago.
  const t=now()-15*60;f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(t,t+1800,t+3600,b.id);
  const r=await bayNoShow(f.owner,{bookingId:b.id});
  assert.match(r.message,/не приехал/);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(b.id).status,'cancelled');
  await assert.rejects(bayNoShow(f.owner,{bookingId:b.id}),/уже нельзя/);
  const rel=(await reliabilityFor(f.db,'guest',[f.guest.userId])).get(f.guest.userId);
  assert.ok(rel,'the guest has a reliability');
 }finally{f.db.close();}
});

test('«Заявкой»: the request waits, the person on shift names another time; the load is hidden when switched off',async()=>{
 const f=await fixture();try{
  const {requestTimes,answerRequest,bayPosts,bayLoad,bayReminders}=await load('bays'),{bayLines}=await load('bay-plan');
  const id=await wash(f,{bookedBays:1,instantConfirm:false,showLoad:false}),start=tomorrow(10),day=Math.floor((start+18000)/86400)*86400-18000;
  const b=await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов',car:'Toyota Camry 123ABC01',requestKey:'a',acceptTerms:true});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(b.id).status,'requested','«Заявкой»: the owner answers');
  const posts=await bayPosts(f.db,id);
  assert.equal(posts.requests.length,1);assert.equal(posts.instant,false);
  const times=await requestTimes(f.owner,{bookingId:b.id,day});
  const later=times.starts.find(v=>v>=start+3*3600);
  assert.ok(later,'other times of the day are offered');
  assert.ok(times.starts.includes(start-1800),'the request does not hold its own box against a move');
  const r=await answerRequest(f.owner,{bookingId:b.id,action:'move',start:later});
  assert.match(r.message,/назначено время/);
  const row=f.db.raw.prepare('SELECT status,start FROM bookings WHERE id=?').get(b.id);
  assert.equal(row.status,'confirmed');assert.equal(row.start,later);
  await assert.rejects(answerRequest(f.owner,{bookingId:b.id,action:'confirm'}),/уже рассмотрена/);
  // «Показывать загрузку» off: the guest sees the queue without a load, and nobody is asked about the boxes.
  const l=await bayLoad(f.db,id);
  assert.equal(l.stale,false);assert.equal(l.known,false);
  assert.equal(bayLines(l)[0],'Живая очередь, без записи');
  const before=f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'bays:ask:%'").get().n;
  await bayReminders(f.db);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'bays:ask:%'").get().n,before);
 }finally{f.db.close();}
});

test('the autopilot of a wash asks about the boxes when nobody taps, and about a late booked car',async()=>{
 const f=await fixture();try{
  const {bayReminders}=await load('bays');
  const id=await wash(f,{bookedBays:1,lateMinutes:10}),start=tomorrow(10);
  await bayReminders(f.db);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND dedupe LIKE 'bays:ask:'||?||'%'").get(f.owner.userId,id).n,1,'nobody named: the owner is asked');
  await bayReminders(f.db);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'bays:ask:%'").get().n,1,'once in half an hour');
  const b=await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+1800),guests:1,billingMode:'hourly',service:'Кузов',car:'Toyota Camry 123ABC01',requestKey:'a',acceptTerms:true});
  const t=now()-15*60;f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(t,t+1800,t+3600,b.id);
  await bayReminders(f.db);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'bays:late:'||?||'%'").get(b.id).body,/приехала\?/);
 }finally{f.db.close();}
});
