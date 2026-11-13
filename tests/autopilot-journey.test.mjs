import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {matchingAction}=await load('smart-matching'),{startOwnerPlan,startCleanerPlan,sweepPlans}=await load('autopilot-plans'),{saveWorkerDispatch}=await load('dispatch');
const {checkAdministratorOwner}=await load('administrator-runtime'),{testPayment}=await load('finance'),{saveEvidence}=await load('evidence'),{saveStayReview}=await load('stay-reviews');
const {openDiscussion,sendDiscussionMessage,readDiscussion}=await load('process-discussions'),{photo}=await import('./fixtures/photo.mjs');

// One stay end to end under both autopilots with test payments: every participant only taps what is theirs.
test('autopilot journey: booking, test payment, check-in, chat, checkout, cleaning, deposit back, cleaner paid, review',async()=>{
 const {RentalService}=await load('service'),f=await fixture(),R=f.db.raw;try{
  const ownerFor=id=>new RentalService(f.db,id),tick=async()=>{f.release();await checkAdministratorOwner(f.db,'owner');};
  const notice=(user,key)=>R.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').get(user,key)?.body;
  const move=(id,job,by)=>{R.prepare('UPDATE bookings SET start=start+?,end=end+?,occupied_until=occupied_until+? WHERE id=?').run(by,by,by,id);R.prepare('UPDATE cleaning_jobs SET start=start+?,end=end+? WHERE id=?').run(by,by,job);};
  R.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);R.prepare("UPDATE cleaning_jobs SET status='cancelled' WHERE id=?").run(f.job.id);
  // Owner and cleaner turn on their autopilots.
  await startOwnerPlan(f.owner,{propertyIds:[f.property]});
  await startCleanerPlan(f.cleaner,{districts:['Центр'],days:127,fromMinute:0,toMinute:1440,minFee:0,maxPerDay:10,askNewOwner:false});await saveWorkerDispatch(f.cleaner,{receiveOffers:true});
  // Guest books through the map; the AI answers and confirms for the owner.
  const base=now(),input={city:'Павлодар',start:iso(base+86400),end:iso(base+172800),guests:'2',mode:'daily',maxPrice:'11000',priority:'balanced',features:[]};
  const r=await matchingAction(f.guest,'guest','begin',{...input,requestKey:'j',consent:true});
  const pv=R.prepare('SELECT version FROM property_policies WHERE property_id=?').get(f.property).version;
  const id=(await matchingAction(f.guest,'guest','book',{...input,billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:pv,id:r.id,offerId:r.properties[0].offerId,acceptTerms:true})).id;
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(id).status,'confirmed');
  assert.match(notice('owner','owner:booking:'+id),/принял бронь/,'the owner is not asked to confirm what the AI already confirmed');
  assert.equal(notice('guest','guest:phone-ask:'+id),undefined);
  assert.match(notice('guest','guest:confirmed:'+id),/Оплатите проживание и депозит в карточке брони/);
  assert.equal(R.prepare('SELECT mode,managed FROM platform_commissions WHERE booking_id=?').get(id).mode,'shadow');
  // The AI offers the cleaning, the cleaner's autopilot takes it, the AI assigns.
  const job=R.prepare('SELECT * FROM cleaning_jobs WHERE booking_id=?').get(id);
  await tick();await tick();R.prepare("UPDATE notifications SET created_at=created_at-1801 WHERE dedupe LIKE 'owner:administrator-propose:%'").run();await tick();
  assert.equal(R.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,'cleaner');
  assert.ok(notice('cleaner','cleaner:autopilot-took:%'));
  // The map shows the AI's own work on the pins it concerns: the owner's object, the cleaner's job.
  const {recentAiMarks}=await load('ai-moves');
  const ownerMarks=await recentAiMarks(f.db,'owner','owner'),cleanerMarks=await recentAiMarks(f.db,'cleaner','cleaner');
  assert.ok(ownerMarks.some(m=>m.kind==='booking'&&m.id===id&&m.move==='confirmed'&&m.propertyId===f.property),'the AI confirmation is on the object');
  assert.ok(ownerMarks.some(m=>m.kind==='job'&&m.id===job.id&&m.move==='assigned'),'the AI assignment is on the object');
  assert.ok(cleanerMarks.some(m=>m.kind==='job'&&m.id===job.id&&m.move==='took'),'the cleaner sees the autopilot took the job');
  assert.ok(!ownerMarks.some(m=>m.move==='took')&&!cleanerMarks.some(m=>m.move==='confirmed'),'each person sees only their own notices');
  // Arrival day. The guest arrives before paying: they are asked to pay in the card, not the owner to check a transfer.
  move(id,job.id,-(86400+600));
  await f.guest.bookingAction(id,{action:'report_checkin'});await tick();
  assert.match(notice('guest','guest:administrator-checkin-pay:'+id),/Оплатите проживание в карточке брони/);
  assert.match(notice('owner','owner:administrator-checkin-payment:'+id),/Гостя попросили оплатить/);
  await testPayment(f.guest,{bookingId:id,kind:'payment'},{},ownerFor);await testPayment(f.guest,{bookingId:id,kind:'deposit'},{},ownerFor);
  // Paid, but a new flat was never marked ready: the owner is told exactly that.
  await tick();assert.equal(R.prepare('SELECT actual_checkin FROM booking_terms WHERE booking_id=?').get(id).actual_checkin,null);
  assert.match(notice('owner','owner:administrator-checkin-ready:'+id),/не отмечено готовым/);
  const op=R.prepare('SELECT version FROM property_operations WHERE property_id=?').get(f.property);
  await f.owner.readinessAction(f.property,{readiness:'ready',note:'Проверено',inspected:true,expectedVersion:op.version});await tick();
  assert.ok(R.prepare('SELECT actual_checkin FROM booking_terms WHERE booking_id=?').get(id).actual_checkin,'the AI checks the guest in');
  // The guest asks in the booking chat; the AI answers from the booking's facts.
  const {roomId}=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:id});
  await sendDiscussionMessage(f.guest,'guest',{roomId,text:'Во сколько выезд?',requestKey:'q1'});
  assert.ok((await readDiscussion(f.guest,'guest',{roomId})).messages.some(m=>/Выезд: до/.test(m.body||m.text||'')));
  // The guest leaves a little early and says so; the AI frees the flat for the cleaner.
  move(id,job.id,-86400+780);await f.guest.bookingAction(id,{action:'report_checkout'});await tick();
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(id).status,'completed');
  assert.equal(R.prepare('SELECT status,assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,'cleaner');
  // The cleaner reports with photos; the AI accepts after an hour without the owner.
  await f.cleaner.jobAction(job.id,{action:'start'});for(const phase of ['before','after','after'])await saveEvidence(f.cleaner,{jobId:job.id,phase,data:photo});
  await f.cleaner.jobAction(job.id,{action:'submit',checklist:[true,true,true,true],report:'Убрано, всё чисто'});await tick();
  R.prepare("UPDATE notifications SET created_at=created_at-3601 WHERE dedupe LIKE 'owner:administrator-review%'").run();await tick();
  assert.equal(R.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(job.id).status,'completed');
  assert.equal(R.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness,'ready');
  // With test money the AI closes the stay: deposit back to the guest, the cleaner paid, once.
  await tick();
  const money=R.prepare('SELECT kind,amount,external_reference ref FROM finance_entries WHERE booking_id=? OR job_id=? ORDER BY kind').all(id,job.id).map(e=>e.kind+':'+e.amount+':'+e.ref.slice(0,5));
  assert.deepEqual(money,['deposit:10000:TEST-','deposit_return:10000:TEST-','job_payment:3000:TEST-','payment:10000:TEST-']);
  assert.ok(R.prepare('SELECT deposit_returned_at FROM booking_terms WHERE booking_id=?').get(id).deposit_returned_at);
  assert.ok(R.prepare('SELECT settled_at FROM cleaning_jobs WHERE id=?').get(job.id).settled_at);
  assert.match(notice('guest','guest:test-deposit-return:'+id),/вернул депозит 10\s000 ₸/);assert.match(notice('cleaner','cleaner:test-payout:'+job.id),/3\s000 ₸/);
  // The guest is asked to rate the stay and the owner sees it; both plans keep running.
  R.prepare('UPDATE booking_terms SET actual_checkout=actual_checkout-3700 WHERE booking_id=?').run(id);await tick();
  assert.ok(notice('guest','guest:review-request:'+id));await saveStayReview(f.guest,{bookingId:id,rating:5,text:'Отлично'});assert.ok(notice('owner','owner:stay-review:'+id));
  await sweepPlans(f.db);assert.deepEqual(R.prepare("SELECT role,status FROM autopilot_plans ORDER BY role").all().map(p=>p.role+':'+p.status),['cleaner:trial','owner:trial']);
 }finally{f.db.close();}
});

test('test money is not settled when the stay has real money, an open issue, or the test mode is off',async()=>{
 const {settleTestMoney}=await load('finance');
 const stay=async(depositRef)=>{const f=await fixture(),R=f.db.raw;
  for(const k of ['booking:'+f.booking,'job:'+f.job.id])R.prepare('INSERT OR IGNORE INTO finance_backfill_receipts VALUES (?,?)').run(k,now());
  for(const [kind,ref] of [['payment','TEST-1'],['deposit',depositRef]])R.prepare("INSERT INTO finance_entries(id,owner_id,property_id,booking_id,job_id,kind,amount,currency,source,external_reference,note,actor_id,request_key,created_at) VALUES (?,?,?,?,NULL,?,10000,'KZT','provider',?,'x','x',?,?)").run(kind,'owner',f.property,f.booking,kind,ref,kind,now());
  R.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);R.prepare('UPDATE booking_terms SET actual_checkout=? WHERE booking_id=?').run(now(),f.booking);R.prepare("UPDATE cleaning_jobs SET status='completed',assigned_to='cleaner' WHERE id=?").run(f.job.id);
  return f;};
 const real=await stay('KASPI-77');try{assert.equal(await settleTestMoney(real.owner,real.property),0,'a real deposit is returned by the owner');}finally{real.db.close();}
 const f=await stay('TEST-2'),R=f.db.raw;try{
  R.prepare("INSERT INTO administrator_issues(id,owner_id,property_id,entity_kind,entity_id,opened_by,opened_role,other_user,other_role,description,created_at) VALUES ('i','owner',?,'job',?,'owner','owner','cleaner','cleaner','Разбита ваза',?)").run(f.property,f.job.id,now());
  assert.equal(await settleTestMoney(f.owner,f.property),0,'an open issue stops it');
  R.prepare("UPDATE administrator_issues SET status='resolved'").run();R.prepare("UPDATE platform_billing SET test_payments=0").run();
  assert.equal(await settleTestMoney(f.owner,f.property),0,'test mode off');
  R.prepare("UPDATE platform_billing SET test_payments=1").run();
  // A reserve that was given back (the assignment was released) does not pay the cleaner; the test payout does.
  R.prepare("INSERT INTO cleaning_holds(job_id,owner_id,cleaner_id,property_id,amount,status,created_at) VALUES (?,?,?,?,3000,'returned',?)").run(f.job.id,'owner','cleaner',f.property,now());
  assert.equal(await settleTestMoney(f.owner,f.property),2);assert.equal(await settleTestMoney(f.owner,f.property),0,'once');
 }finally{f.db.close();}
});
