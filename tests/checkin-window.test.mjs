import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {checkinOpen,checkinOpensLabel,CHECKIN_LEAD_SECONDS}=await load('checkin-window');

test('check-in opens 15 minutes before the agreed time',()=>{
 const start=1794600000;
 assert.equal(CHECKIN_LEAD_SECONDS,900);
 assert.equal(checkinOpen(start,start-901),false);
 assert.equal(checkinOpen(start,start-900),true);
 assert.equal(checkinOpen(start,start+3600),true);
 assert.match(checkinOpensLabel(start,start-3600),/^в \d\d:\d\d$/);
 assert.match(checkinOpensLabel(start,start-3*86400),/^\d+ [а-я]+ в \d\d:\d\d$/);
});

test('the guest cannot report and the owner cannot confirm a check-in earlier than 15 minutes before it',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'confirmed');
  // The fixture's stay starts in an hour.
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'report_checkin'}),/за 15 минут до заезда/);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'checkin'}),/за 15 минут до заезда/);
  R.prepare('UPDATE bookings SET start=start-3000,end=end-3000,occupied_until=occupied_until-3000 WHERE id=?').run(f.booking);
  const r=await f.guest.bookingAction(f.booking,{action:'report_checkin'});
  assert.match(r.message,/Спасибо/);
  assert.ok(R.prepare('SELECT checkin_reported_at FROM booking_terms WHERE booking_id=?').get(f.booking).checkin_reported_at);
 }finally{f.close?.();}
});
