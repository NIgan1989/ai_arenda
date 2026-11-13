import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';

const listing=(extra={})=>({title:'Отель у парка',city:'Павлодар',district:'Центр',address:'PRIVATE HOTEL ADDRESS',description:'Небольшая гостиница в центре: номера с отдельным санузлом, завтраки, стойка регистрации круглосуточно.',price:15000,rooms:1,capacity:2,cleaningMinutes:60,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type:'hotel',area:20,beds:2,bathrooms:1,floor:1,floors:3,checkinMethod:'reception',amenities:['wifi'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина после 23:00.'},...extra});

test('a hotel cleans with its own staff by default: no cleaning job, no fee, ready right after checkout',async()=>{
 const f=await fixture();try{
  const id=(await f.owner.saveListing(null,listing())).id,row=()=>f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(id);
  assert.equal(row().own_staff,1);
  const policy=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(id);
  await f.owner.savePolicy(id,{expectedVersion:policy.version,dailyPrice:15000,hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина',autoConfirm:false,autoAssign:false,cleaningFee:3000,cleaningBudget:4000});
  assert.equal(f.db.raw.prepare('SELECT cleaning_fee FROM property_policies WHERE property_id=?').get(id).cleaning_fee,0);
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);
  const booking=(await f.guest.createBooking({propertyId:id,start:iso(now()+86400),end:iso(now()+2*86400),guests:1,billingMode:'daily',requestKey:'hotel',acceptTerms:true})).id;
  const r=await f.owner.bookingAction(booking,{action:'confirm',cleaningFee:3000});
  assert.equal(r.message,'Бронь подтверждена.');
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs WHERE property_id=?').get(id).n,0);
  // Check-in and checkout: after the guest leaves, the hotel is ready again without a cleaning job.
  const op=()=>f.db.raw.prepare('SELECT * FROM property_operations WHERE property_id=?').get(id);
  await f.owner.readinessAction(id,{readiness:'ready',note:'Номер готов',inspected:true,expectedVersion:op().version});
  await f.owner.bookingAction(booking,{action:'paid'});
  f.db.raw.prepare('UPDATE bookings SET start=?,"end"=? WHERE id=?').run(now()-60,now()+3600,booking);
  await f.owner.bookingAction(booking,{action:'checkin'});assert.equal(op().readiness,'occupied');
  await f.owner.bookingAction(booking,{action:'checkout'});assert.equal(op().readiness,'ready');
  await assert.rejects(f.owner.createJob({propertyId:id,start:iso(now()+3*86400),end:iso(now()+3*86400+3600),fee:3000,description:'Уборка'}),/свой персонал/i);
  // The AI can run a hotel without a cleaning fee.
  const {setGuestMode}=await load('autopilot');
  const auto=await setGuestMode(f.owner,{propertyId:id,mode:'auto'});assert.match(auto.message,/Уборку делает ваш персонал/);
  const {draftListingBody,readListingText,emptyDraft}=await load('listing-draft');
  const d=readListingText('Хостел в центре, 6 мест, 5 000 в сутки',emptyDraft('Павлодар')).draft;assert.equal(d.type,'hostel');assert.equal(d.ownStaff,true);
  assert.equal(draftListingBody(d,[],false).ownStaff,true);
 }finally{f.db.close();}
});

test('switching «Свой персонал» on cancels planned cleanings by executors and drops the fee',async()=>{
 const f=await fixture();try{
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'open');
  const policy=f.db.raw.prepare('SELECT version FROM property_policies WHERE property_id=?').get(f.property);
  await f.owner.saveListing(f.property,listing({title:'Test apartment',ownStaff:true,policyVersion:policy.version,details:{...listing().details,type:'apartment',checkinMethod:'meet'}}));
  assert.equal(f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(f.property).own_staff,1);
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'cancelled');
  assert.equal(f.db.raw.prepare('SELECT cleaning_fee FROM property_policies WHERE property_id=?').get(f.property).cleaning_fee,0);
  // An older app sends no ownStaff: the property keeps it.
  const v=f.db.raw.prepare('SELECT d.version lv,p.version pv FROM property_details d JOIN property_policies p ON p.property_id=d.property_id WHERE d.property_id=?').get(f.property);
  const body=listing({title:'Test apartment',expectedVersion:v.lv,policyVersion:v.pv,details:{...listing().details,type:'apartment',checkinMethod:'meet'}});
  await f.owner.saveListing(f.property,body);
  assert.equal(f.db.raw.prepare('SELECT own_staff FROM properties WHERE id=?').get(f.property).own_staff,1);
  // Under «ИИ» with own staff, switching back to executors pauses automatic confirmation until a fee is set.
  const {setGuestMode}=await load('autopilot');await setGuestMode(f.owner,{propertyId:f.property,mode:'auto'});
  const w=f.db.raw.prepare('SELECT d.version lv,p.version pv,p.auto_confirm FROM property_details d JOIN property_policies p ON p.property_id=d.property_id WHERE d.property_id=?').get(f.property);assert.equal(w.auto_confirm,1);
  const off=await f.owner.saveListing(f.property,{...body,ownStaff:false,expectedVersion:w.lv,policyVersion:w.pv});
  assert.match(off.message,/Автопилот приостановлен/);
  const after=f.db.raw.prepare('SELECT auto_confirm,auto_assign FROM property_policies WHERE property_id=?').get(f.property);assert.equal(after.auto_confirm,0);assert.equal(after.auto_assign,0);
 }finally{f.db.close();}
});
