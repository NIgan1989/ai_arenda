import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
// Audit 2026-11-22 «Отзывы и надёжность»: a wrong episode is cancelled with the answer, a returned report stays with its
// author, rooms of one type share one rating, the term to review is seen before the stars, two administrators race.
const {reliabilityFor,ratingEpisodes}=await load('reliability');
const {riskSignals,saveRiskSql,assessBookingRisk}=await load('booking-risk');
const {objectReliability,answerObjection,objectionQueue}=await load('reliability-objection');
const {ratingsFor}=await load('stay-reviews');
const {canRate,rateClosed}=await load('review-window');
const DAY=86400,audit=(f,entity,action,at=now())=>f.db.raw.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run('a-'+Math.random(),'owner',entity,action,at);

test('a dispute the administrator found wrong leaves the rating and the risk of the next request',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  audit(f,f.booking,'booking.checkout_disputed:ключи не вернул');audit(f,f.booking,'booking.checkout_confirmed');
  const before=(await reliabilityFor(f.db,'guest',['guest'])).get('guest');
  assert.ok(before.facts.includes('споров при выезде: 1'));
  const signals=()=>riskSignals(f.db,'guest',{start:now()+2*DAY,end:now()+3*DAY,billingMode:'daily',price:10000,deposit:0});
  assert.equal((await signals()).disputes,1);
  // A request waiting for the owner, assessed with the dispute.
  const waiting='waiting-request';
  f.db.raw.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,?,?,?,?,1,10000,'requested',?,'unpaid','w',?)").run(waiting,f.property,'guest',now()+5*DAY,now()+6*DAY,now()+6*DAY,now()+3600,now());
  f.db.raw.prepare("INSERT INTO booking_terms(booking_id,billing_mode,rate,units,amount,deposit,deposit_status,house_rules,policy_version,original_end,min_hours) VALUES (?,'daily',10000,1,10000,0,'not_required','',1,?,1)").run(waiting,now()+6*DAY);
  const risky=assessBookingRisk(await signals());await saveRiskSql(f.db,waiting,f.property,'guest','owner',risky).run();
  assert.ok(JSON.parse(f.db.raw.prepare('SELECT reasons FROM booking_risks WHERE booking_id=?').get(waiting).reasons).includes('был спор при выезде'));
  const o=(await objectReliability(f.db,'guest','guest',{text:'Спор был ошибочным, владелец сам подтвердил выезд.'},'')).objection;
  const card=(await objectionQueue(f.db)).find(x=>x.id===o.id);
  assert.deepEqual(card.episodes.map(e=>e.kind+':'+e.id),['dispute:'+f.booking]);assert.match(card.episodes[0].note,/ключи не вернул/);
  assert.ok(card.reliability.facts.includes('споров при выезде: 1'),'the administrator sees what the rating is made of');
  await assert.rejects(answerObjection(f.db,'admin1',{id:o.id,answer:'Проверили: претензия была ошибочной.',cancel:['dispute:someone-else']}),e=>e.status===409);
  const r=await answerObjection(f.db,'admin1',{id:o.id,answer:'Проверили: претензия была ошибочной.',cancel:['dispute:'+f.booking]});
  assert.match(r.message,/Оценка пересчитана/);
  const after=(await reliabilityFor(f.db,'guest',['guest'])).get('guest');
  assert.ok(!after.facts.some(v=>v.startsWith('споров')),'the cancelled dispute no longer counts');assert.ok(after.score>(before.score||0));
  assert.equal((await signals()).disputes,0);
  assert.ok(!JSON.parse(f.db.raw.prepare('SELECT reasons FROM booking_risks WHERE booking_id=?').get(waiting).reasons).includes('был спор при выезде'),'the waiting request is assessed again');
  // The old record stays in the history, marked as cancelled.
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action LIKE 'booking.checkout_disputed%'").get().n,1);
  assert.equal((await ratingEpisodes(f.db,'guest','guest'))[0].voided,true);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'guest:reliability-objection:%'").get().body,/Отменено отметок в оценке: 1/);
 }finally{f.db.close();}
});

test('a returned report stays with the one who sent it, not with the next cleaner',async()=>{
 const f=await fixture();try{
  // The first cleaner sent the report and got it back; the job then went to another cleaner.
  f.db.raw.prepare("INSERT INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES ('n1','cleaner','Доработайте уборку: пыль на полках',?,0,?)").run('cleaner:revision:'+f.job.id+':3',now());
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='other' WHERE id=?").run(f.job.id);
  const marks=await reliabilityFor(f.db,'cleaner',['cleaner','other']);
  assert.ok(marks.get('cleaner').facts.includes('возвратов на доработку: 1'));
  assert.equal(marks.get('other').level,'new','the new cleaner has sent nothing yet');
  assert.match((await ratingEpisodes(f.db,'cleaner','cleaner'))[0].note,/пыль на полках/);
 }finally{f.db.close();}
});

test('rooms of one type show the same rating whichever room is free',async()=>{
 const f=await fixture();try{
  const room=(await f.owner.createProperty({title:'Номер 2',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  f.db.raw.prepare('INSERT INTO room_units(property_id,lead_id,created_at) VALUES (?,?,?)').run(room,f.property,now());
  f.db.raw.prepare('INSERT INTO stay_reviews(booking_id,property_id,guest_id,owner_id,rating,body,created_at) VALUES (?,?,?,?,5,\'\',?)').run(f.booking,f.property,'guest','owner',now());
  const r=await ratingsFor(f.db,[f.property,room]);
  assert.deepEqual(r.get(room),r.get(f.property));assert.equal(r.get(room).average,5);assert.equal(r.get(room).count,1);
 }finally{f.db.close();}
});

test('the term to review is known before the stars',()=>{
 const t=1_800_000_000,b=(out,patch={})=>({status:'completed',terms:{actual_checkout:out},...patch});
 assert.equal(canRate(b(t-13*DAY),t),true);
 assert.equal(canRate(b(t-15*DAY),t),false);assert.equal(rateClosed(b(t-15*DAY),t),true);
 assert.equal(rateClosed(b(t-15*DAY,{review_rating:4}),t),false,'a rated stay says nothing');
 assert.equal(canRate({status:'confirmed',terms:{actual_checkout:t}},t),false);
});

test('two administrators answer at once: one answer, one journal mark, one notice; the other is told',async()=>{
 const f=await fixture();try{
  const o=(await objectReliability(f.db,'guest','guest',{text:'Оценка несправедлива, прошу проверить.'},'')).objection;
  const both=await Promise.allSettled([answerObjection(f.db,'admin1',{id:o.id,answer:'Проверили: оценка верна.'},5000),answerObjection(f.db,'admin2',{id:o.id,answer:'Проверили: претензия ошибочна.'},5000)]);
  assert.equal(both.filter(r=>r.status==='fulfilled').length,1);
  assert.match(both.find(r=>r.status==='rejected').reason.message,/другой администратор/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action LIKE '%reliability_objection_answered%'").get().n,1);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'guest:reliability-objection:%'").get().n,1);
 }finally{f.db.close();}
});
