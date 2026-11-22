import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {dueOf,chargeSlot,sweepDues,serviceBillingState,serviceBillingAction,PAY_DAYS}=await load('service-dues');
const {readOperations,writeOperations}=await load('operations-api'),{companyFinance,monthKey}=await load('company-finance');
const DAY=86400,WEEK=7*DAY,noPlans=async()=>{};
const billing=(f,user)=>f.db.raw.prepare('SELECT * FROM service_billing WHERE user_id=?').get(user);
const entries=(f,user)=>f.db.raw.prepare('SELECT * FROM owner_balance_entries WHERE owner_id=? ORDER BY created_at,rowid').all(user);
let seq=0;const owe=(f,user,amount,role='cleaner')=>f.db.raw.prepare("INSERT INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,mode,settled_at,created_at) VALUES (?,?,?,?,?,1,?,'charged',?,?)").run('c'+Math.random(),user,role,now()+(seq++),now()+30*DAY,amount,role==='owner'?now():null,now());
const notes=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').all(user,like).map(n=>n.body);

test('the weekly charge is due on Monday 10:00 local time',()=>{
 const monday=Date.UTC(2026,10,16,5,0,0)/1000; // 16 November 2026 is a Monday; 10:00 in Qyzylorda is 05:00 UTC
 assert.equal(chargeSlot(monday),monday);assert.equal(chargeSlot(monday+3*DAY),monday);assert.equal(chargeSlot(monday-60),monday-WEEK);assert.equal(chargeSlot(monday+WEEK),monday+WEEK);
});

test('a linked card pays the accrued fees once a week; nothing is topped up and nothing is taken twice',async()=>{
 const f=await fixture();try{
  assert.equal(await dueOf(f.db,'cleaner'),0);
  assert.match((await serviceBillingAction(f.cleaner,{action:'link'})).message,/Тестовая карта привязана\. Списания раз в неделю/);
  owe(f,'cleaner',1900);assert.equal(await dueOf(f.db,'cleaner'),1900);
  let state=await readOperations(f.cleaner,'cleaner',['service-billing','state']);
  assert.equal(state.due,1900);assert.deepEqual(state.card,{mask:'•• 0000',test:true});assert.equal(state.items[0].kind,'autopilot');assert.equal(state.items[0].amount,1900);
  // Just after the next Monday charge, so the «same week» below does not cross the next Monday on any weekday.
  const at=chargeSlot(now())+WEEK+60;assert.deepEqual(await sweepDues(f.db,noPlans,at),{charged:1,asked:0,paused:0});
  assert.equal(await dueOf(f.db,'cleaner'),0);
  const e=entries(f,'cleaner');assert.equal(e.length,1);assert.equal(e[0].kind,'topup');assert.equal(e[0].amount,1900);assert.match(e[0].note,/Списание с карты •• 0000 за услуги сервиса \(тест\)/);
  assert.ok(f.db.raw.prepare("SELECT settled_at FROM autopilot_charges WHERE user_id='cleaner'").get().settled_at,'the month is settled only by the charge');
  assert.match(notes(f,'cleaner','service:charged:%')[0],/списано 1\s900 ₸.*тестовое списание/);
  // A new fee in the same week waits for the next Monday.
  owe(f,'cleaner',500);assert.equal((await sweepDues(f.db,noPlans,at+DAY)).charged,0);assert.equal(await dueOf(f.db,'cleaner'),500);
  assert.equal((await sweepDues(f.db,noPlans,chargeSlot(at)+WEEK+60)).charged,1);assert.equal(await dueOf(f.db,'cleaner'),0);assert.equal(entries(f,'cleaner').length,2);
  // «Оплатить сейчас» does not wait for Monday; the card is unlinked only when nothing is owed.
  owe(f,'cleaner',700);await assert.rejects(writeOperations(f.cleaner,'cleaner',['service-billing'],{action:'unlink'}),e=>e.status===409);
  state=(await writeOperations(f.cleaner,'cleaner',['service-billing'],{action:'pay'})).state;assert.equal(state.due,0);
  assert.match((await serviceBillingAction(f.cleaner,{action:'unlink'})).message,/отвязана/);assert.equal((await serviceBillingState(f.cleaner)).card,null);
  await assert.rejects(readOperations(f.guest,'guest',['service-billing','state']),e=>e.status===403);
 }finally{f.db.close();}
});

test('without a card: one ask, seven days, then a pause that a payment lifts',async()=>{
 const f=await fixture();try{
  owe(f,'owner',4900,'owner');const at=now();
  assert.deepEqual(await sweepDues(f.db,noPlans,at),{charged:0,asked:1,paused:0});assert.equal((await sweepDues(f.db,noPlans,at+DAY)).asked,0);
  assert.equal((await serviceBillingState(f.owner)).payBy,at+PAY_DAYS*DAY);
  let paused=0;assert.equal((await sweepDues(f.db,async()=>{paused++;},at+PAY_DAYS*DAY+1)).paused,1);assert.equal(paused,1);assert.ok(billing(f,'owner').paused_at);
  assert.match(notes(f,'owner','service:paused:%')[0],/Пауза: 4\s900 ₸/);assert.equal((await serviceBillingState(f.owner)).paused,true);
  await assert.rejects(serviceBillingAction(f.owner,{action:'pay'}),e=>e.status===409&&/привяжите карту/.test(e.message));
  // An administrator's entry (a transfer outside the app) also clears the debt and the pause.
  f.db.raw.prepare("INSERT INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) VALUES ('m1','owner','topup',4900,'Kaspi','admin','m1',?)").run(now());
  await sweepDues(f.db,noPlans,at+9*DAY);assert.equal(billing(f,'owner').paused_at,null);assert.equal(billing(f,'owner').failed_at,null);
  // A real bank is not connected yet: with gateway settings the test card is refused instead of pretending.
  await assert.rejects(serviceBillingAction(f.owner,{action:'link'},{PAYMENT_GATEWAY_URL:'https://pay.example',PAYMENT_GATEWAY_TOKEN:'t'}),e=>e.status===503);
 }finally{f.db.close();}
});

// The launch check: every tenge the service earns is seen by the payer and by «Бухгалтерия».
test('end to end, one tariff in percent: the AI costs nothing extra, a cleaning brings the performer\'s 5% and nothing from the owner',async()=>{
 const f=await fixture(),R=f.db.raw,{startCleanerPlan}=await load('autopilot-plans');try{
  R.prepare("UPDATE platform_billing SET enabled=1,starts_at=?,plan_charge=1,free_bookings=1000").run(now()-60);
  const second=(await f.owner.createProperty({title:'Second home',city:'Павлодар',district:'Центр',address:'ADDRESS 2',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  await f.owner.savePolicy(second,f.policy);
  const started=await writeOperations(f.owner,'owner',['autopilot','start'],{propertyIds:[f.property,second],cleaningFees:{[f.property]:3000,[second]:3000}});
  assert.equal(started.done.length,2,started.message);assert.equal(await dueOf(f.db,'owner'),0,'no bookings, nothing to pay');
  await startCleanerPlan(f.cleaner,{districts:[],days:127,fromMinute:0,toMinute:1440,minFee:0,maxPerDay:4,askNewOwner:false});assert.equal(await dueOf(f.db,'cleaner'),0);
  // An ordinary cleaning for 4 000 ₸: the owner pays the performer directly; the service accrues 5% (200 ₸) to the performer only.
  R.prepare("UPDATE cleaning_jobs SET fee=4000,status='assigned',assigned_to='cleaner',start=?,end=? WHERE id=?").run(now()+15,now()+5415,f.job.id);
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);
  await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
  await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:[true,true,true,true],report:'Done'});await f.owner.jobAction(f.job.id,{action:'approve'});
  assert.equal(R.prepare('SELECT amount FROM cleaning_commissions WHERE job_id=?').get(f.job.id).amount,0);
  assert.equal(await dueOf(f.db,'owner'),0);assert.equal(await dueOf(f.db,'cleaner'),200);
  // «Всё включено» is gone: nothing monthly can be added.
  await assert.rejects(writeOperations(f.owner,'owner',['autopilot','tier'],{tier:'all'}),e=>e.status===409);assert.equal(await dueOf(f.db,'owner'),0);
  // The performer links a card; the weekly charge takes exactly what was accrued.
  await serviceBillingAction(f.cleaner,{action:'link'});
  assert.equal((await sweepDues(f.db,noPlans,now())).charged,1);
  assert.deepEqual(entries(f,'cleaner').map(e=>e.amount),[200]);
  const theirs=await serviceBillingState(f.cleaner),sum=(s,k)=>s.items.filter(i=>i.kind===k).reduce((a,i)=>a+i.amount,0);
  assert.equal(theirs.due,0);assert.equal(sum(theirs,'cleaner_job'),200);assert.equal(sum(theirs,'payment'),200);
  // «Бухгалтерия»: 200 ₸ of revenue and the same 200 ₸ on the account.
  const report=await companyFinance(f.db,{basis:'fact',month:monthKey()}),pl=report.current.pl,cf=report.current.cf;
  assert.equal(pl.gross,200);assert.equal(cf.inflow,200);
  assert.equal(report.balance.receivable||0,0,'nobody owes the service anything');
 }finally{f.db.close();}
});

test('«Оплатить сейчас» that overlaps the Monday round takes the debt once; a paused participant gets no free trial',async()=>{
 const f=await fixture(),{ensurePlan}=await load('autopilot-plans');try{
  await serviceBillingAction(f.cleaner,{action:'link'});owe(f,'cleaner',1900);
  await Promise.all([serviceBillingAction(f.cleaner,{action:'pay'}),sweepDues(f.db,noPlans,now()+1)]);
  const e=entries(f,'cleaner');assert.equal(e.length,1,'one entry');assert.equal(e[0].amount,1900);assert.equal(await dueOf(f.db,'cleaner'),0);
  assert.equal(notes(f,'cleaner','service:charged:%').length,1,'one notice, for the charge that happened');
  owe(f,'owner',4900,'owner');const at=now();await sweepDues(f.db,noPlans,at);await sweepDues(f.db,noPlans,at+PAY_DAYS*DAY+1);assert.ok(billing(f,'owner').paused_at);
  f.db.raw.prepare("DELETE FROM autopilot_plans WHERE user_id='owner'").run();
  await assert.rejects(ensurePlan(f.db,'owner','owner',now(),1),e=>e.status===402);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM autopilot_plans WHERE user_id='owner'").get().n,0);
 }finally{f.db.close();}
});

// ── Safe card charges: the record comes before the bank, a lost answer is never repeated ──
const {cardChargesAction,cardChargesAdmin}=await load('service-dues');
const admins={PLATFORM_ADMIN_IDS:'owner'};
const charges=(f,user)=>f.db.raw.prepare('SELECT * FROM card_charges WHERE user_id=? ORDER BY created_at,rowid').all(user);

test('a lost bank answer is never repeated: the charge waits as «unknown» until the administrator checks the bank',async()=>{
 const f=await fixture();try{
  await serviceBillingAction(f.cleaner,{action:'link'});owe(f,'cleaner',1900);
  let calls=0;const bank=async op=>{calls++;throw new Error('timeout '+op.id);};
  const at=now();assert.equal((await sweepDues(f.db,noPlans,at,admins,bank)).charged,0);
  assert.equal(calls,1);assert.equal(charges(f,'cleaner')[0].status,'unknown');assert.equal(entries(f,'cleaner').length,0);assert.equal(await dueOf(f.db,'cleaner'),1900);
  assert.match(notes(f,'owner','admin:charge-unknown:%')[0],/Повторять не будем/);
  // Neither the next round nor «Оплатить сейчас» goes to the bank again while the answer is unknown.
  assert.equal((await sweepDues(f.db,noPlans,at+WEEK,admins,bank)).charged,0);
  assert.equal(await serviceBillingAction(f.cleaner,{action:'pay'},admins,bank).then(r=>r.message),'Сейчас платить нечего.');
  assert.equal(calls,1);assert.equal((await serviceBillingState(f.cleaner)).checking,1900);
  // The administrator checked the bank: the money was taken. The ledger records it once.
  const id=charges(f,'cleaner')[0].id;
  await assert.rejects(cardChargesAction(f.db,'owner',{action:'resolve',id,outcome:'succeeded'}),/Подтвердите/);
  assert.match((await cardChargesAction(f.db,'owner',{action:'resolve',id,outcome:'succeeded',confirmed:true})).message,/списал/);
  assert.equal(entries(f,'cleaner').length,1);assert.equal(await dueOf(f.db,'cleaner'),0);
  await assert.rejects(cardChargesAction(f.db,'owner',{action:'resolve',id,outcome:'failed',confirmed:true}),e=>e.status===409);
 }finally{f.db.close();}
});

test('a declined card writes nothing, is not retried the same week, and gives the seven days',async()=>{
 const f=await fixture();try{
  await serviceBillingAction(f.cleaner,{action:'link'});owe(f,'cleaner',1900);
  let calls=0;const bank=async()=>{calls++;return {status:'failed',error:'insufficient_funds'};};
  const at=now();await sweepDues(f.db,noPlans,at,admins,bank);await sweepDues(f.db,noPlans,at+60,admins,bank);
  assert.equal(calls,1,'one automatic attempt a week');assert.equal(charges(f,'cleaner')[0].status,'failed');assert.equal(entries(f,'cleaner').length,0);
  assert.equal(billing(f,'cleaner').failed_at,at);assert.match(notes(f,'cleaner','service:declined:%')[0],/Деньги не сняты/);
  await assert.rejects(serviceBillingAction(f.cleaner,{action:'pay'},admins,bank),e=>e.status===402);
  let paused=0;await sweepDues(f.db,async()=>{paused++;},at+PAY_DAYS*DAY+1,admins,bank);assert.equal(paused,1);
 }finally{f.db.close();}
});

test('the stop switch halts every charge; a large week waits for the person; the daily limit holds the round',async()=>{
 const f=await fixture();try{
  await serviceBillingAction(f.cleaner,{action:'link'});await serviceBillingAction(f.owner,{action:'link'});owe(f,'cleaner',1900);
  await cardChargesAction(f.db,'owner',{action:'stop'});
  assert.equal((await sweepDues(f.db,noPlans,now(),admins)).charged,0);
  await assert.rejects(serviceBillingAction(f.cleaner,{action:'pay'},admins),e=>e.status===503);
  assert.equal((await serviceBillingState(f.cleaner)).stopped,true);assert.equal(charges(f,'cleaner').length,0);
  await cardChargesAction(f.db,'owner',{action:'resume'});
  // Above the confirmation threshold the Monday round only asks.
  await cardChargesAction(f.db,'owner',{action:'limits',confirmAbove:1000,dailyLimit:100000});
  const at=now();assert.equal((await sweepDues(f.db,noPlans,at,admins)).charged,0);
  assert.equal(charges(f,'cleaner')[0].status,'held');assert.equal((await serviceBillingState(f.cleaner)).confirm,1900);
  assert.match(notes(f,'cleaner','service:held:%')[0],/подтвердите её кнопкой «Оплатить сейчас»/);
  assert.match((await serviceBillingAction(f.cleaner,{action:'pay'},admins)).message,/Списано 1\s900/);assert.equal(await dueOf(f.db,'cleaner'),0);
  // The daily limit: what was taken today counts, the rest waits for tomorrow.
  await cardChargesAction(f.db,'owner',{action:'limits',confirmAbove:100000,dailyLimit:10000});
  owe(f,'owner',9000,'owner');
  assert.equal((await sweepDues(f.db,noPlans,at+60,admins)).charged,0,'1 900 taken today + 9 000 is over 10 000');
  assert.match(notes(f,'owner','admin:charge-limit:%')[0],/Дневной предел/);
  assert.equal((await cardChargesAdmin(f.db)).today,1900);
 }finally{f.db.close();}
});

test('an attempt left «started» by a stopped worker becomes «unknown» and is reported, never retried',async()=>{
 const f=await fixture();try{
  await serviceBillingAction(f.cleaner,{action:'link'});owe(f,'cleaner',1900);
  const at=now();f.db.raw.prepare("INSERT INTO card_charges(id,user_id,request_key,amount,status,reason,card_mask,test,created_at) VALUES ('op1','cleaner','card:cleaner:x',1900,'started','now','•• 0000',1,?)").run(at-16*60);
  let calls=0;await sweepDues(f.db,noPlans,at,admins,async()=>{calls++;return {status:'succeeded'};});
  assert.equal(calls,0);assert.equal(f.db.raw.prepare("SELECT status FROM card_charges WHERE id='op1'").get().status,'unknown');
  assert.match(notes(f,'owner','admin:charge-unknown:op1%')[0],/не завершилось/);
  assert.match((await cardChargesAction(f.db,'owner',{action:'resolve',id:'op1',outcome:'failed',confirmed:true})).message,/не списал/);
  assert.equal(entries(f,'cleaner').length,0);
 }finally{f.db.close();}
});

test('while charges are stopped nobody is paused; linking a card never takes a sum above the confirmation threshold',async()=>{
 const f=await fixture();try{
  owe(f,'owner',4900,'owner');const at=now();await sweepDues(f.db,noPlans,at,admins);assert.ok(billing(f,'owner').failed_at);
  await cardChargesAction(f.db,'owner',{action:'stop'});
  let paused=0;await sweepDues(f.db,async()=>{paused++;},at+PAY_DAYS*DAY+1,admins);assert.equal(paused,0);assert.equal(billing(f,'owner').paused_at,null);
  await cardChargesAction(f.db,'owner',{action:'resume'});
  await cardChargesAction(f.db,'owner',{action:'limits',confirmAbove:1000,dailyLimit:100000});
  assert.doesNotMatch((await serviceBillingAction(f.owner,{action:'link'},admins)).message,/Списано/);assert.equal(await dueOf(f.db,'owner'),4900);
  assert.match((await serviceBillingAction(f.owner,{action:'pay'},admins)).message,/Списано 4\s900/);
 }finally{f.db.close();}
});

test('a day before the Monday charge the card holder is told the sum, once; a large sum and a stopped round are not announced',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  await serviceBillingAction(f.cleaner,{action:'link'});owe(f,'cleaner',1900);
  const monday=chargeSlot(now())+WEEK,remind=n=>notes(f,'cleaner','service:remind:%').length===n;
  // This week's charge is already done: the debt waits for the next Monday.
  R.prepare("UPDATE service_billing SET last_charge_at=? WHERE user_id='cleaner'").run(monday-WEEK);
  await sweepDues(f.db,noPlans,monday-DAY-60);assert.ok(remind(0),'not before Sunday 10:00');
  await sweepDues(f.db,noPlans,monday-DAY+60);assert.ok(remind(1));
  assert.match(notes(f,'cleaner','service:remind:%')[0],/Завтра в 10:00 с карты •• 0000 спишется 1\s900 ₸ за услуги сервиса\. За что и как оспорить/);
  await sweepDues(f.db,noPlans,monday-60);assert.ok(remind(1),'one reminder a week');
  // The next week: a sum above the confirmation threshold waits for the person, so no reminder.
  await sweepDues(f.db,noPlans,monday+60);owe(f,'cleaner',200000);
  await sweepDues(f.db,noPlans,monday+WEEK-DAY+60);assert.ok(remind(1));
  // Charges stopped by the administrator: nobody is reminded.
  R.prepare("DELETE FROM autopilot_charges WHERE amount=200000").run();owe(f,'cleaner',500);
  R.prepare("UPDATE platform_billing SET charges_stopped_at=? WHERE id='global'").run(now());
  await sweepDues(f.db,noPlans,monday+WEEK-DAY+120);assert.ok(remind(1));
 }finally{f.db.close();}
});
