import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {matchingAction}=await load('smart-matching'),{startOwnerPlan,startCleanerPlan,sweepPlans}=await load('autopilot-plans'),{saveWorkerDispatch}=await load('dispatch');
const {checkAdministratorOwner}=await load('administrator-runtime'),{saveEvidence}=await load('evidence'),{saveStayReview}=await load('stay-reviews');
const {openDiscussion,sendDiscussionMessage,readDiscussion}=await load('process-discussions'),{photo}=await import('./fixtures/photo.mjs');

// One stay end to end under both autopilots with direct settlements: the money goes between the people, the AI does the rest.
test('autopilot journey: booking, direct payment, check-in, chat, checkout, cleaning, deposit back, cleaner paid, review',async()=>{
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
  assert.match(notice('guest','guest:confirmed:'+id),/Оплата при заселении: реквизиты владельца откроются/,'a new place: the guest pays at the door');
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
  const {aiJournal}=await load('ai-moves'),ownerLog=await aiJournal(f.db,'owner','owner'),cleanerLog=await aiJournal(f.db,'cleaner','cleaner');
  assert.ok(ownerLog.some(e=>e.text==='ИИ подтвердил бронь'&&e.title)&&ownerLog.some(e=>e.text==='ИИ назначил исполнителя'),'the owner reads what the AI did, with the object');
  assert.ok(cleanerLog.some(e=>e.text==='Автопилот взял уборку'&&e.title),'the cleaner reads what the autopilot took');
  assert.ok(ownerLog.every((e,i)=>!i||ownerLog[i-1].at>=e.at),'the newest first');
  // Each line opens what it is about: the booking, the cleaning.
  assert.deepEqual(ownerLog.find(e=>e.text==='ИИ подтвердил бронь').open,{kind:'booking',id});assert.deepEqual(ownerLog.find(e=>e.text==='ИИ назначил исполнителя').open,{kind:'job',id:job.id});
  assert.deepEqual(cleanerLog.find(e=>e.text==='Автопилот взял уборку').open,{kind:'job',id:job.id});
  assert.ok(ownerLog.some(e=>e.text==='ИИ назначил исполнителя'&&e.who&&e.start>0)&&cleanerLog.every(e=>!e.who),'the owner reads who was assigned and when; a worker\'s own line carries no name');
  assert.ok(ownerLog.filter(e=>e.kind!==undefined).length===0&&ownerLog.every(e=>!e.open||e.title),'a line that opens something names the home');
  assert.ok(!ownerMarks.some(m=>m.move==='took')&&!cleanerMarks.some(m=>m.move==='confirmed'),'each person sees only their own notices');
  // Arrival day. The guest arrives before paying: they are asked to transfer to the owner, the owner to check the bank.
  move(id,job.id,-(86400+600));
  await f.guest.bookingAction(id,{action:'report_checkin'});await tick();
  assert.match(notice('guest','guest:administrator-checkin-pay:'+id),/Переведите владельцу оплату по реквизитам из карточки брони и нажмите «Я оплатил»/);
  assert.match(notice('owner','owner:administrator-checkin-payment:'+id),/Проверьте поступление в банке и подтвердите в брони/);
  await f.guest.bookingAction(id,{action:'report_paid'});assert.match(notice('owner','owner:paid-reported:'+id+':%'),/Гость сообщил, что перевёл вам 20\s000 ₸/);
  await f.owner.bookingAction(id,{action:'received'});
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
  // The money never passes through the service: the owner returns the deposit and pays the cleaner himself and marks both.
  await tick();
  const version=()=>R.prepare('SELECT version FROM booking_terms WHERE booking_id=?').get(id).version;
  await f.owner.bookingAction(id,{action:'record_deposit_return',confirmed:true,expectedVersion:version()});
  await f.owner.jobAction(job.id,{action:'record_job_payment',confirmed:true,expectedVersion:R.prepare('SELECT version FROM cleaning_jobs WHERE id=?').get(job.id).version});
  const money=R.prepare('SELECT kind,amount,source FROM finance_entries WHERE booking_id=? OR job_id=? ORDER BY kind').all(id,job.id).map(e=>e.kind+':'+e.amount+':'+e.source);
  assert.deepEqual(money,['deposit:10000:owner','deposit_return:10000:owner','job_payment:3000:owner','payment:10000:owner']);
  assert.ok(R.prepare('SELECT deposit_returned_at FROM booking_terms WHERE booking_id=?').get(id).deposit_returned_at);
  assert.ok(R.prepare('SELECT settled_at FROM cleaning_jobs WHERE id=?').get(job.id).settled_at);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='guest' AND body LIKE 'Владелец отметил, что вернул депозит%'").get().body,/10\s000 ₸/);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='cleaner' AND body LIKE 'Заказчик отметил, что перевёл вам%'").get().body,/3\s000 ₸/);
  // The guest is asked to rate the stay and the owner sees it; both plans keep running.
  R.prepare('UPDATE booking_terms SET actual_checkout=actual_checkout-3700 WHERE booking_id=?').run(id);await tick();
  assert.ok(notice('guest','guest:review-request:'+id));await saveStayReview(f.guest,{bookingId:id,rating:5,text:'Отлично'});assert.ok(notice('owner','owner:stay-review:'+id));
  await sweepPlans(f.db);assert.deepEqual(R.prepare("SELECT role,status FROM autopilot_plans ORDER BY role").all().map(p=>p.role+':'+p.status),['cleaner:trial','owner:trial']);
 }finally{f.db.close();}
});
