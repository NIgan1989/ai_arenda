import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {parseCalendar,saveCalendarSource,importCalendar,createCalendarExport,exportCalendar}=await load('external-calendar');
const {savePropertyAccess,revealPropertyAccess,requestPhoneCode,verifyPhoneCode}=await load('participant-security');
const {recordFinance}=await load('finance');
const dt=t=>new Date(t*1000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const ics=(a,b,extra='')=>['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:external-event','DTSTART:'+dt(a),'DTEND:'+dt(b),extra,'END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
test('calendar import blocks availability at both quote and SQL levels; malformed imports preserve prior blocks',async()=>{
 const f=await fixture();try{
  const start=now()+86400,end=start+7200,created=await saveCalendarSource(f.owner,{propertyId:f.property,label:'Test external source',ics:ics(start,end)},{});
  assert.equal(created.count,1);await assert.rejects(f.guest.bookingQuote({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'hourly'}),e=>e.status===409);
  const catalog=await f.guest.publicSearch({city:'Павлодар',mode:'hourly',start:iso(start),end:iso(end),guests:'1'});assert.equal(catalog.properties.length,0);
  const source=f.db.raw.prepare('SELECT * FROM calendar_sources WHERE id=?').get(created.id);
  await assert.rejects(importCalendar(f.db,source,ics(start,end,'RRULE:FREQ=DAILY')));assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM external_blocks').get().n,1);
  assert.throws(()=>f.db.raw.prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('bypass',f.property,'guest',start,end,end+5400,1,4000,'requested',now()+1800,'unpaid','bypass',now()),/external_calendar_overlap/);
  const feed=await createCalendarExport(f.owner,{propertyId:f.property},{}),token=feed.url.split('/').at(-1),text=await exportCalendar(f.db,token);assert.ok(text.includes('SUMMARY:Reserved'));assert.ok(!text.includes('PRIVATE ADDRESS'));assert.ok(!text.includes('Owner'));
 }finally{f.db.close();}
});
test('stale automatic calendars prevent new reservations without erasing existing booking facts',async()=>{
 const f=await fixture();try{
  await saveCalendarSource(f.owner,{propertyId:f.property,label:'Waiting for sync',url:'https://calendar.google.com/calendar/ical/example/basic.ics'},{});
  await assert.rejects(f.guest.bookingQuote({propertyId:f.property,start:iso(now()+86400),end:iso(now()+93600),guests:1,billingMode:'hourly'}),e=>e.status===409);
  const b=(await f.owner.state()).bookings[0];assert.equal(b.status,'confirmed');assert.equal(b.terms.actual_checkout,null);
  assert.throws(()=>parseCalendar(ics(now()+86400,now()+90000).replace('Z','')));
 }finally{f.db.close();}
});
test('access instructions are encrypted, never returned outside the authorised time and payment/readiness gates',async()=>{
 const f=await fixture(),config={ACCESS_ENCRYPTION_KEY:'test-only-encryption-secret-'.repeat(3)};try{
  await savePropertyAccess(f.owner,{propertyId:f.property,expectedVersion:0,instructions:'Private access instructions and temporary lock code'},config);
  assert.ok(!f.db.raw.prepare('SELECT ciphertext FROM property_access').get().ciphertext.includes('Private access'));
  await assert.rejects(revealPropertyAccess(f.guest,'guest',{entityId:f.booking},config),e=>e.status===403);
  await recordFinance(f.owner,{kind:'payment',bookingId:f.booking,amount:4000,confirmed:true,note:'Received',requestKey:'pay'});await recordFinance(f.owner,{kind:'deposit',bookingId:f.booking,amount:10000,confirmed:true,note:'Received',requestKey:'deposit'});
  await f.owner.readinessAction(f.property,{readiness:'ready',expectedVersion:1,inspected:true,note:'Inspected'});
  const instruction=await revealPropertyAccess(f.guest,'guest',{entityId:f.booking},config);assert.match(instruction.instructions,/Private access/);
  await assert.rejects(revealPropertyAccess(f.other,'owner',{propertyId:f.property},config),e=>e.status===403);
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-7200,now()-60,now()+5340,f.booking);await assert.rejects(revealPropertyAccess(f.guest,'guest',{entityId:f.booking},config),e=>e.status===403);
 }finally{f.db.close();}
});
test('phone challenge uses the account number, stores only a hash and limits incorrect guesses',async()=>{
 const f=await fixture(),fetch=globalThis.fetch;let code='',to='';try{
  f.db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run('guest','+77000000001','Guest','test-hash','test-recovery',now());
  globalThis.fetch=async(_url,request)=>{const body=JSON.parse(request.body);to=body.to;code=body.text.match(/\d{6}/)[0];return Response.json({id:'sms-test'});};
  await requestPhoneCode(f.guest,{SMS_GATEWAY_URL:'https://sms.example.test/send',SMS_GATEWAY_TOKEN:'test-token'});assert.equal(to,'+77000000001');assert.ok(!f.db.raw.prepare('SELECT code_hash FROM phone_verifications').get().code_hash.includes(code));
  await verifyPhoneCode(f.guest,{code});assert.ok(f.db.raw.prepare('SELECT verified_at FROM phone_verifications').get().verified_at);
  await assert.rejects(requestPhoneCode(f.guest,{SMS_GATEWAY_URL:'https://sms.example.test/send',SMS_GATEWAY_TOKEN:'test-token'}),e=>e.status===429);
  f.db.raw.prepare('UPDATE phone_verifications SET sent_at=0').run();await requestPhoneCode(f.guest,{SMS_GATEWAY_URL:'https://sms.example.test/send',SMS_GATEWAY_TOKEN:'test-token'});
  const wrong=code==='000000'?'111111':'000000';for(let i=0;i<5;i++)await assert.rejects(verifyPhoneCode(f.guest,{code:wrong}));await assert.rejects(verifyPhoneCode(f.guest,{code}),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT verified_at FROM phone_verifications').get().verified_at,null);
 }finally{globalThis.fetch=fetch;f.db.close();}
});
