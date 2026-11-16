// The second audit of the roles' processes: what a person could do that the service should not have let them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {commandRole}=await load('access');

test('an owner cannot book their own home as a guest',async()=>{
 const f=await fixture();try{
  await f.owner.saveProfile({name:'Owner',roles:['owner','guest'],city:'Павлодар',contact:'test'});
  await assert.rejects(f.owner.createBooking({propertyId:f.property,start:iso(now()+86400),end:iso(now()+86400+7200),guests:1,billingMode:'hourly',requestKey:'own',acceptTerms:true}),e=>e.status===403&&/ваше жильё/.test(e.message));
 }finally{f.db.close();}
});

test('a guest does not hold the same time in two homes without paying',async()=>{
 const f=await fixture();try{
  const second=(await f.other.createProperty({title:'Second home',city:'Павлодар',district:'Центр',address:'OTHER ADDRESS',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  await f.other.savePolicy(second,f.policy);
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(second);
  const ask=key=>f.guest.createBooking({propertyId:second,start:iso(now()+3600),end:iso(now()+10800),guests:1,billingMode:'hourly',requestKey:key,acceptTerms:true});
  // The fixture's stay is confirmed and unpaid at the same time.
  await assert.rejects(ask('twin'),e=>e.status===409&&/неоплаченная бронь: «Test apartment»/.test(e.message));
  await f.owner.bookingAction(f.booking,{action:'paid'});
  assert.ok((await ask('twin-paid')).id,'a paid stay does not stop the guest from booking another home');
 }finally{f.db.close();}
});

test('a cleaner takes an application back before the owner answers, and can apply again',async()=>{
 const f=await fixture();try{
  await f.cleaner.jobAction(f.job.id,{action:'apply'});
  assert.match((await f.cleaner.jobAction(f.job.id,{action:'withdraw'})).message,/отозван/);
  assert.equal(f.db.raw.prepare("SELECT status FROM applications WHERE job_id=? AND user_id='cleaner'").get(f.job.id).status,'rejected');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:application-withdrawn:%'").get().n,1);
  await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'withdraw'}),e=>e.status===409);
  await f.cleaner.jobAction(f.job.id,{action:'apply'});
  assert.equal(f.db.raw.prepare("SELECT status FROM applications WHERE job_id=? AND user_id='cleaner'").get(f.job.id).status,'pending');
 }finally{f.db.close();}
});

test('what the cleaner does from the app is allowed in the cleaner role',()=>{
 for(const action of ['apply','withdraw','start','submit','vacant','late','release','extend','issue'])assert.ok(commandRole('jobs/x',{action}).includes('cleaner'),action);
 for(const action of ['assign','approve','cancel','close'])assert.deepEqual(commandRole('jobs/x',{action}),['owner'],action);
 assert.deepEqual(commandRole('bookings/x',{action:'keep_deposit'}),['owner']);
});
