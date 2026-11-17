import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';
const {staffState,assignStaff,removeStaff,markBusy,freeBusy,staffToday,staffMark,stayStep,staffPlaces}=await load('staff');

// «Сотрудник» и «Занято» (lib/staff.ts): the owner names the person on shift in the settings of the object.
const listing=()=>({title:'Баня на дровах',city:'Павлодар',district:'Центр',address:'PRIVATE BATH ADDRESS',description:'Баня на дровах с парилкой и купелью, комната отдыха на шесть человек, мангал во дворе, парковка у ворот.',price:36000,rooms:1,capacity:8,cleaningMinutes:60,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type:'banya',area:40,beds:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:['steam','plunge','brooms'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:3000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина после 23:00.',includedGuests:4,extraGuestPrice:500,prepMinutes:120}});
const account=(f,id,phone,name)=>f.db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,phone,name,'fixture','fixture',now());
async function bath(f){const id=(await f.owner.saveListing(null,listing())).id;f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);account(f,'cleaner','+77010000003','Айдар Сотрудник');f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);return id;}

test('the owner names the person on shift by phone, in the object, and takes it back',async()=>{
 const f=await fixture();try{
  const id=await bath(f);account(f,'owner','+77010000001','Owner');
  assert.equal((await staffState(f.owner,id)).staff,null);
  await assert.rejects(assignStaff(f.owner,{propertyId:id,phone:'+7 701 000 00 99'}),/никто не зарегистрирован/);
  await assert.rejects(assignStaff(f.owner,{propertyId:id,phone:'+7 701 000 00 01'}),/ваш номер/);
  await assert.rejects(assignStaff(f.other,{propertyId:id,phone:'8 701 000 00 03'}),/недоступен/);
  const done=await assignStaff(f.owner,{propertyId:id,phone:'8 701 000 00 03'});
  assert.equal(done.staff.name,'Айдар Сотрудник');assert.match(done.message,/теперь отмечает гостей/);
  assert.equal(await staffPlaces(f.db,'cleaner'),1);assert.equal((await f.cleaner.roleState('cleaner',{catalog:false})).staffPlaces,1);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='cleaner' AND body LIKE '%назначили сотрудником%'").get());
  // Only the owner sees who is named; the person sees the object in «Смена».
  await assert.rejects(staffState(f.cleaner,id),/./);
  assert.deepEqual((await staffToday(f.cleaner)).places.map(p=>p.id),[id]);
  assert.deepEqual((await staffToday(f.guest)).places,[]);
  const off=await removeStaff(f.owner,{propertyId:id});assert.equal(off.staff,null);
  assert.equal(await staffPlaces(f.db,'cleaner'),0);
  await assert.rejects(markBusy(f.cleaner,{propertyId:id,hours:2}),/недоступен/);
 }finally{f.db.close();}
});

test('«Занято»: the hours are closed for guests of the service, a booked stay is not written over',async()=>{
 const f=await fixture();try{
  const id=await bath(f);await assignStaff(f.owner,{propertyId:id,phone:'+77010000003'});
  await assert.rejects(markBusy(f.cleaner,{propertyId:id,hours:13}),/./);
  const busy=await markBusy(f.cleaner,{propertyId:id,hours:3});
  assert.equal(busy.busy.length,1);assert.equal(busy.busy[0].end-busy.busy[0].start,3*3600);assert.match(busy.message,/Занято до \d\d:\d\d/);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND body LIKE '%занято до%отметил сотрудник%'").get());
  const start=Math.ceil((now()+3600)/3600)*3600,ask={propertyId:id,start:iso(start),end:iso(start+2*3600),guests:4,billingMode:'hourly',requestKey:'busy',acceptTerms:true};
  await assert.rejects(f.guest.createBooking(ask),/Интервал занят/);
  // The mark is not shown to the owner as a calendar of another site.
  const {flatCalendars}=await load('external-calendar');assert.deepEqual((await flatCalendars(f.owner,{propertyId:id})).sources,[]);
  // A new mark replaces the last one; «Освободить» opens the hours again.
  assert.equal((await markBusy(f.owner,{propertyId:id,hours:1})).busy.length,1);
  assert.deepEqual((await freeBusy(f.cleaner,{propertyId:id})).busy,[]);
  const booking=(await f.guest.createBooking(ask)).id;await f.owner.bookingAction(booking,{action:'confirm'});
  await assert.rejects(markBusy(f.cleaner,{propertyId:id,hours:4}),/уже есть бронь через сервис/);
  assert.equal((await markBusy(f.cleaner,{propertyId:id,hours:1})).busy.length,1);
 }finally{f.db.close();}
});

test('«Смена»: затоплено, гости пришли, гости ушли, готово, each mark done in the owner\'s name',async()=>{
 const f=await fixture();try{
  const id=await bath(f);await assignStaff(f.owner,{propertyId:id,phone:'+77010000003'});
  const start=Math.ceil((now()+7200)/3600)*3600;
  const booking=(await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+3*3600),guests:5,billingMode:'hourly',requestKey:'shift',acceptTerms:true})).id;
  await f.owner.bookingAction(booking,{action:'confirm'});await f.owner.bookingAction(booking,{action:'paid'});await f.owner.readinessAction(id,{readiness:'ready',inspected:true});
  const stay=async()=>(await staffToday(f.cleaner)).places[0].stays.find(b=>b.id===booking);
  assert.deepEqual([(await stay()).stage,(await stay()).next,(await stay()).guests],['wait','heated',5]);
  // «Затопить» reaches the person on shift too.
  const {sweepPrep}=await load('bath-prep');await sweepPrep(f.db,start-3600);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='cleaner' AND dedupe LIKE 'staff:prep:%'").get());
  await assert.rejects(staffMark(f.guest,{bookingId:booking,mark:'heated'}),/недоступен/);
  const heated=await staffMark(f.cleaner,{bookingId:booking,mark:'heated'});assert.match(heated.message,/затоплено/);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='guest' AND body LIKE '%баня затоплена%'").get());
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id='owner' AND body LIKE '%сотрудник отметил «Затоплено»%'").get());
  assert.equal((await stay()).next,'arrived');
  // The owner's rules stand: too early to let the guests in.
  await assert.rejects(staffMark(f.cleaner,{bookingId:booking,mark:'arrived'}),/за 15 минут/);
  f.db.raw.prepare('UPDATE bookings SET start=?,"end"=?,occupied_until=? WHERE id=?').run(now()-60,now()+3600,now()+7200,booking);
  await staffMark(f.cleaner,{bookingId:booking,mark:'arrived'});
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(id).readiness,'occupied');
  assert.deepEqual([(await stay()).stage,(await stay()).next],['here','left']);
  await staffMark(f.cleaner,{bookingId:booking,mark:'left'});
  assert.deepEqual([(await stay()).stage,(await stay()).next],['left','ready']);
  const ready=await staffMark(f.cleaner,{bookingId:booking,mark:'ready'});
  assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(id).readiness,'ready');
  assert.deepEqual(ready.places[0].stays,[]);
  await assert.rejects(staffMark(f.cleaner,{bookingId:booking,mark:'paid'}),/недоступна/);
 }finally{f.db.close();}
});

test('the next mark of a stay',()=>{
 const at=1000,b={start:2000,end:5000};
 assert.deepEqual(stayStep(b,'ready',true,at),{stage:'wait',next:'heated'});
 assert.deepEqual(stayStep(b,'ready',false,at),{stage:'wait',next:'arrived'});
 assert.deepEqual(stayStep({...b,prepared_at:900},'ready',true,at),{stage:'wait',next:'arrived'});
 assert.deepEqual(stayStep({...b,actual_checkin:2000},'occupied',true,3000),{stage:'here',next:'left'});
 assert.deepEqual(stayStep({...b,actual_checkin:2000,actual_checkout:4000},'awaiting_cleaning',true,4100),{stage:'left',next:'ready'});
 assert.deepEqual(stayStep({...b,actual_checkin:2000,actual_checkout:4000},'ready',true,4100),{stage:'done',next:null});
});
