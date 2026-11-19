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
  const at=now();assert.deepEqual(await sweepDues(f.db,noPlans,at),{charged:1,asked:0,paused:0});
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
test('end to end: an owner pays 9 800 ₸ for two homes on «Автопилот», a performer 1 900 ₸, a 4 000 ₸ cleaning brings 400 ₸',async()=>{
 const f=await fixture(),R=f.db.raw,{setGuestMode}=await load('autopilot'),{startCleanerPlan}=await load('autopilot-plans');try{
  R.prepare("UPDATE platform_billing SET enabled=1,starts_at=?,plan_charge=1,plan_trial_days=0,cleaning_rate_bp=1000,free_bookings=1000").run(now()-60);
  const second=(await f.owner.createProperty({title:'Second home',city:'Павлодар',district:'Центр',address:'ADDRESS 2',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  await f.owner.savePolicy(second,f.policy);
  const started=await writeOperations(f.owner,'owner',['autopilot','start'],{propertyIds:[f.property,second],cleaningFees:{[f.property]:3000,[second]:3000}});
  assert.equal(started.done.length,2,started.message);assert.equal(await dueOf(f.db,'owner'),9800);
  await startCleanerPlan(f.cleaner,{districts:[],days:127,fromMinute:0,toMinute:1440,minFee:0,maxPerDay:4,askNewOwner:false});assert.equal(await dueOf(f.db,'cleaner'),1900);
  assert.doesNotMatch(JSON.stringify(notes(f,'cleaner','%autopilot%')),/из выплат/,'the performer pays by card, nothing is withheld from cleanings');
  // An ordinary cleaning for 4 000 ₸: the owner pays the performer directly, the service accrues 10% to the owner.
  R.prepare("UPDATE cleaning_jobs SET fee=4000,status='assigned',assigned_to='cleaner',start=?,end=? WHERE id=?").run(now()+15,now()+5415,f.job.id);
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);
  await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
  await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:[true,true,true,true],report:'Done'});await f.owner.jobAction(f.job.id,{action:'approve'});
  assert.equal(R.prepare('SELECT amount FROM cleaning_commissions WHERE job_id=?').get(f.job.id).amount,400);
  assert.equal(await dueOf(f.db,'owner'),10200);assert.equal(await dueOf(f.db,'cleaner'),1900);
  // Both link a card; the weekly charge takes exactly what was accrued.
  await serviceBillingAction(f.owner,{action:'link'});await serviceBillingAction(f.cleaner,{action:'link'});
  assert.equal((await sweepDues(f.db,noPlans,now())).charged,2);
  assert.deepEqual(entries(f,'owner').map(e=>e.amount),[10200]);assert.deepEqual(entries(f,'cleaner').map(e=>e.amount),[1900]);
  // Each payer sees what for and how much.
  const mine=await serviceBillingState(f.owner),theirs=await serviceBillingState(f.cleaner),sum=(s,k)=>s.items.filter(i=>i.kind===k).reduce((a,i)=>a+i.amount,0);
  assert.equal(mine.due,0);assert.equal(sum(mine,'autopilot'),9800);assert.equal(sum(mine,'cleaning'),400);assert.equal(sum(mine,'payment'),10200);
  assert.equal(theirs.due,0);assert.equal(sum(theirs,'autopilot'),1900);assert.equal(sum(theirs,'payment'),1900);
  // «Бухгалтерия»: 12 100 ₸ of revenue and the same 12 100 ₸ on the account.
  const report=await companyFinance(f.db,{basis:'fact',month:monthKey()}),pl=report.current.pl,cf=report.current.cf;
  assert.equal(pl.autopilot,11700);assert.equal(pl.cleaning,400);assert.equal(pl.gross,12100);assert.equal(cf.inflow,12100);
  assert.equal(report.balance.receivable||0,0,'nobody owes the service anything');
 }finally{f.db.close();}
});
