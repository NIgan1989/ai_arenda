import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,now,iso} from './helpers/platform.mjs';

test('booking survives additive columns from older local installations and retries do not duplicate it',async()=>{
 const f=await fixture();
 try{
  // This column exists in the reported local database, outside canonical migrations.
  f.db.raw.exec("ALTER TABLE bookings ADD COLUMN rate_unit TEXT NOT NULL DEFAULT 'day'");
  const body={propertyId:f.property,start:iso(now()+3*86400),end:iso(now()+4*86400),guests:2,billingMode:'daily',requestKey:'legacy-local-booking',acceptTerms:true};
  const quote=await f.guest.bookingQuote(body);
  const submitted={...body,expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version};
  const result=await f.guest.createBooking(submitted);
  const saved=f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(result.id);
  assert.equal(saved.status,'requested');assert.equal(saved.guests,2);assert.equal(saved.amount,quote.amount);assert.equal(saved.rate_unit,'day');
  assert.equal(saved.occupied_until,quote.end+quote.cleaningMinutes*60);
  assert.equal(f.db.raw.prepare('SELECT amount FROM booking_terms WHERE booking_id=?').get(result.id).amount,quote.amount);
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM notifications WHERE dedupe=?").get('owner:booking:'+result.id).n,1);
  assert.equal((await f.guest.createBooking(submitted)).id,result.id);
  assert.equal(f.db.raw.prepare('SELECT count(*) n FROM bookings WHERE guest_id=? AND request_key=?').get('guest',body.requestKey).n,1);
  await assert.rejects(f.guest.createBooking({...submitted,requestKey:'overlapping-legacy-booking'}),e=>e.status===409);
 }finally{f.db.close();}
});
