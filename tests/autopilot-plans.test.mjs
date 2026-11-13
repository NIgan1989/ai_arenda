import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {setGuestMode}=await load('autopilot');
const {sweepPlans,stopPlan,startCleanerPlan,autopilotFits,planState,awayToday}=await load('autopilot-plans');
const {readOperations,writeOperations}=await load('operations-api');
const {coordinateDispatch}=await load('dispatch');
const {ownerAvailable,markCleanerPayout,cleanerPayouts}=await load('regular-cleaner');
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');
const config=f=>({PLATFORM_ADMIN_IDS:f.other.userId});
const DAY=86400;
const plan=(f,user='owner',role='owner')=>f.db.raw.prepare('SELECT * FROM autopilot_plans WHERE user_id=? AND role=?').get(user,role);
const charges=(f,user='owner')=>f.db.raw.prepare('SELECT * FROM autopilot_charges WHERE user_id=? ORDER BY created_at,rowid').all(user);
const topUp=(f,amount)=>f.db.raw.prepare("INSERT INTO owner_balance_entries(id,owner_id,kind,amount,note,actor_id,request_key,created_at) VALUES (?,?,?,?,?,?,?,?)").run('e'+Math.random(),'owner','topup',amount,'Kaspi','admin','k'+Math.random(),now());
const charging=(f,on=true)=>f.db.raw.prepare("UPDATE platform_billing SET plan_charge=?").run(on?1:0);
const auto=f=>setGuestMode(f.owner,{propertyId:f.property,mode:'auto',cleaningFee:3000});
const managed=f=>f.db.raw.prepare('SELECT auto_confirm FROM property_policies WHERE property_id=?').get(f.property).auto_confirm===1;
// The fixture's cleaning follows a stay that ends a few hours from now, so in the evening it runs past
// local midnight and no daily window fits it. Rules tests move it to tomorrow's noon (Asia/Almaty, UTC+5).
const daytime=f=>{const local=now()+DAY+5*3600,noon=local-local%DAY-5*3600+12*3600;f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,"end"=? WHERE id=?').run(noon,noon+5400,f.job.id);};
const openRules={districts:[],days:127,fromMinute:0,toMinute:1440,minFee:0,maxPerDay:4,askNewOwner:false};

test('turning a flat to «ИИ» starts the free trial once, with a notice; the state shows the flat as managed',async()=>{
 const f=await fixture();try{
  await auto(f);
  const p=plan(f);assert.equal(p.status,'trial');assert.ok(Math.abs(p.period_end-(now()+14*DAY))<5);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe='owner:autopilot-trial:owner'").get().body,/14 дней бесплатно.*плата не взимается/);
  await auto(f);assert.equal(plan(f).version,1);
  const state=await readOperations(f.owner,'owner',['autopilot','state']);
  assert.equal(state.live,true);assert.equal(state.units,1);assert.equal(state.flats[0].managed,true);assert.equal(state.settings.price,4900);
  await assert.rejects(readOperations(f.guest,'guest',['autopilot','state']),e=>e.status===403);
 }finally{f.db.close();}
});

test('while charging is off a renewal is only recorded; with charging on it takes the balance, else grace and then pause',async()=>{
 const f=await fixture();try{
  await auto(f);
  // Trial ends: shadow month, nothing taken.
  f.db.raw.prepare("UPDATE autopilot_plans SET period_end=?").run(now()-10);
  assert.equal((await sweepPlans(f.db)).renewed,1);
  assert.equal(plan(f).status,'active');assert.deepEqual(charges(f).map(c=>[c.mode,c.amount,c.units]),[['shadow',4900,1]]);
  // Charging on, balance enough: the month is taken from the free balance.
  charging(f);topUp(f,6000);f.db.raw.prepare("UPDATE autopilot_plans SET period_end=?").run(now()-20);
  await sweepPlans(f.db);assert.equal(charges(f).at(-1).mode,'charged');assert.equal(await ownerAvailable(f.db,'owner'),1100);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE dedupe LIKE 'owner:autopilot-paid:%'").get());
  // Not enough: grace, the flat stays with the AI.
  f.db.raw.prepare("UPDATE autopilot_plans SET period_end=?").run(now()-30);
  assert.equal((await sweepPlans(f.db)).grace,1);assert.equal(plan(f).status,'grace');assert.ok(managed(f));
  // Grace over: pause, the flat goes back to «Я сам».
  f.db.raw.prepare("UPDATE autopilot_plans SET grace_until=?").run(now()-1);
  assert.equal((await sweepPlans(f.db)).paused,1);assert.equal(plan(f).status,'paused');assert.equal(managed(f),false);
  // Turning it on again pays the month first: no money, refused and the flat stays manual.
  await assert.rejects(auto(f),e=>e.status===402);assert.equal(managed(f),false);
  topUp(f,5000);await auto(f);assert.equal(plan(f).status,'active');assert.equal(charges(f).at(-1).amount,4900);assert.ok(managed(f));
 }finally{f.db.close();}
});

test('stop: a trial pauses now and the flats go manual; a paid month with charging on runs to its end',async()=>{
 const f=await fixture();try{
  await auto(f);await stopPlan(f.owner,'owner');assert.equal(plan(f).status,'paused');assert.equal(managed(f),false);
  charging(f);topUp(f,10000);await auto(f);assert.equal(plan(f).status,'active');
  const r=await writeOperations(f.owner,'owner',['autopilot','stop'],{});assert.match(r.message,/не продлится/);
  assert.equal(plan(f).status,'active');assert.equal(plan(f).auto_renew,0);assert.ok(managed(f));
  f.db.raw.prepare("UPDATE autopilot_plans SET period_end=?").run(now()-10);await sweepPlans(f.db);
  assert.equal(plan(f).status,'paused');assert.equal(managed(f),false);assert.equal(charges(f).length,1);
 }finally{f.db.close();}
});

test('cleaner rules decide what the AI takes: district, day, hours, pay, load, new owner',async()=>{
 const f=await fixture();try{
  daytime(f);
  const job=f.db.raw.prepare('SELECT j.*,p.district FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=?').get(f.job.id);
  assert.equal(await autopilotFits(f.db,'cleaner',job),false);
  await startCleanerPlan(f.cleaner,openRules);assert.equal(plan(f,'cleaner','cleaner').status,'trial');
  assert.equal(await autopilotFits(f.db,'cleaner',job),true);
  const fits=async rules=>{await writeOperations(f.cleaner,'cleaner',['autopilot','rules'],{...openRules,...rules});return autopilotFits(f.db,'cleaner',job);};
  assert.equal(await fits({districts:['Другой']}),false);assert.equal(await fits({districts:['центр']}),true);
  assert.equal(await fits({minFee:job.fee+1}),false);
  assert.equal(await fits({days:0x7f&~(1<<((new Date((job.start+5*3600)*1000).getUTCDay()+6)%7))}),false);
  assert.equal(await fits({askNewOwner:true}),false);
  await assert.rejects(writeOperations(f.cleaner,'cleaner',['autopilot','rules'],{...openRules,fromMinute:600,toMinute:630}),/не меньше часа/);
  const state=await planState(f.cleaner,'cleaner');assert.deepEqual(state.cityDistricts,['Центр']);assert.equal(state.rules.askNewOwner,true);
 }finally{f.db.close();}
});

test('the cleaner autopilot accepts a fitting offer at once, and «Не могу сегодня» stops it until tomorrow',async()=>{
 const f=await fixture();try{
  daytime(f);await auto(f);await startCleanerPlan(f.cleaner,openRules);
  await coordinateDispatch(f.owner);
  const offer=f.db.raw.prepare("SELECT * FROM cleaning_offers WHERE worker_id='cleaner'").get();assert.ok(offer);
  assert.notEqual(offer.status,'offered');
  assert.ok(f.db.raw.prepare("SELECT 1 FROM audit_events WHERE actor_id='system:cleaner-autopilot' AND entity_id=?").get(offer.id));
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE dedupe=?").get('cleaner:autopilot-took:'+offer.id));
  assert.equal((await planState(f.cleaner,'cleaner')).week.taken,1);
  await awayToday(f.cleaner);
  const job=f.db.raw.prepare('SELECT j.*,p.district FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id=?').get(f.job.id);
  assert.equal(await autopilotFits(f.db,'cleaner',{...job,start:now()+600,end:now()+1200}),false);
 }finally{f.db.close();}
});

test('a cleaner charge is withheld from the next payout and settled by it',async()=>{
 const f=await fixture();try{
  f.db.raw.exec('PRAGMA foreign_keys=OFF');
  f.db.raw.prepare("INSERT INTO cleaning_holds(job_id,owner_id,cleaner_id,property_id,amount,status,created_at,due_at) VALUES (?,?,?,?,?,?,?,?)").run(f.job.id,'owner','cleaner',f.property,3000,'due',now(),now());
  f.db.raw.prepare("INSERT INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,mode,created_at) VALUES ('c1','cleaner','cleaner',?,?,1,1900,'charged',?)").run(now()-DAY,now()+29*DAY,now());
  f.db.raw.exec('PRAGMA foreign_keys=ON');
  assert.equal((await cleanerPayouts(f.db)).due.find(d=>d.job_id===f.job.id).withhold,1900);
  // The sheet showed no deduction: the payout is refused instead of silently paying less.
  await assert.rejects(markCleanerPayout(f.other,{jobId:f.job.id,note:'Kaspi',confirmed:true,withhold:0}),e=>e.status===409);
  await markCleanerPayout(f.other,{jobId:f.job.id,note:'Kaspi',confirmed:true,withhold:1900});
  const c=f.db.raw.prepare("SELECT * FROM autopilot_charges WHERE id='c1'").get();assert.ok(c.settled_at);assert.equal(c.settled_job,f.job.id);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='cleaner' ORDER BY created_at DESC").get().body,/1\s100.*минус 1\s900.*автопилот/);
 }finally{f.db.close();}
});

test('the administrator sets prices and turns charging on with consent; people on a plan are told',async()=>{
 const f=await fixture();try{
  await auto(f);
  const before=await readPlatformAdmin(f.other,'billing/plans',{},config(f));assert.equal(before.owner.trial,1);assert.equal(before.owner.flats,1);assert.equal(before.settings.charge,false);
  const body={ownerPrice:5900,cleanerPrice:1500,trialDays:7,graceDays:2,charge:true};
  await assert.rejects(writePlatformAdmin(f.other,'billing/plans',body,config(f)),/Подтвердите/);
  await assert.rejects(writePlatformAdmin(f.owner,'billing/plans',{...body,confirmed:true},config(f)),e=>e.status===403);
  const r=await writePlatformAdmin(f.other,'billing/plans',{...body,confirmed:true},config(f));
  assert.equal(r.state.settings.ownerPrice,5900);assert.equal(r.state.settings.charge,true);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'owner:autopilot-terms:%'").get().body,/5\s900/);
 }finally{f.db.close();}
});

test('a payout smaller than the month withholds part of it, and the next payout settles the rest',async()=>{
 const f=await fixture();try{
  f.db.raw.exec('PRAGMA foreign_keys=OFF');
  const second=f.job.id+'-2';
  f.db.raw.prepare('INSERT INTO cleaning_jobs SELECT ?,'+f.db.raw.prepare('PRAGMA table_info(cleaning_jobs)').all().slice(1).map(c=>c.name==='booking_id'?'NULL':['start','end'].includes(c.name)?c.name+'+86400':c.name).join(',')+' FROM cleaning_jobs WHERE id=?').run(second,f.job.id);
  for(const id of [f.job.id,second])f.db.raw.prepare("INSERT INTO cleaning_holds(job_id,owner_id,cleaner_id,property_id,amount,status,created_at,due_at) VALUES (?,?,?,?,?,?,?,?)").run(id,'owner','cleaner',f.property,1000,'due',now(),now());
  f.db.raw.prepare("INSERT INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,mode,created_at) VALUES ('c1','cleaner','cleaner',?,?,1,1900,'charged',?)").run(now()-DAY,now()+29*DAY,now());
  f.db.raw.exec('PRAGMA foreign_keys=ON');
  assert.equal((await cleanerPayouts(f.db)).due.find(d=>d.job_id===f.job.id).withhold,1000);
  await markCleanerPayout(f.other,{jobId:f.job.id,confirmed:true,withhold:1000});
  let c=f.db.raw.prepare("SELECT * FROM autopilot_charges WHERE id='c1'").get();assert.equal(c.withheld,1000);assert.equal(c.settled_at,null);
  assert.equal((await cleanerPayouts(f.db)).due.find(d=>d.job_id===second).withhold,900);
  await markCleanerPayout(f.other,{jobId:second,confirmed:true,withhold:900});
  c=f.db.raw.prepare("SELECT * FROM autopilot_charges WHERE id='c1'").get();assert.equal(c.withheld,1900);assert.ok(c.settled_at);
 }finally{f.db.close();}
});

test('turning the plan on checks the flats first: nothing is charged when none can go on, and duplicates count once',async()=>{
 const f=await fixture();try{
  charging(f);topUp(f,20000);f.db.raw.prepare("INSERT INTO autopilot_plans(user_id,role,status,started_at,period_end,updated_at) VALUES ('owner','owner','paused',?,?,?)").run(now()-40*DAY,now()-10*DAY,now()-10*DAY);
  f.db.raw.prepare('UPDATE property_policies SET mandate_until=? WHERE property_id=?').run(now()-60,f.property);
  const r=await writeOperations(f.owner,'owner',['autopilot','start'],{propertyIds:[f.property]});
  assert.match(r.message,/не включён.*полномочий/);assert.equal(charges(f).length,0);assert.equal(plan(f).status,'paused');
  f.db.raw.prepare('UPDATE property_policies SET mandate_until=0 WHERE property_id=?').run(f.property);
  await writeOperations(f.owner,'owner',['autopilot','start'],{propertyIds:[f.property,f.property,'missing']});
  assert.deepEqual(charges(f).map(c=>[c.units,c.amount]),[[1,4900]]);assert.ok(managed(f));
 }finally{f.db.close();}
});

test('«Не могу сегодня» also takes back today\'s accepted offers that are not assigned yet',async()=>{
 const f=await fixture();try{
  await auto(f);await startCleanerPlan(f.cleaner,openRules);
  f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+600,now()+1800,f.job.id);
  await coordinateDispatch(f.owner);
  assert.equal(f.db.raw.prepare("SELECT status FROM cleaning_offers WHERE worker_id='cleaner'").get().status,'accepted');
  await awayToday(f.cleaner);
  assert.equal(f.db.raw.prepare("SELECT status FROM cleaning_offers WHERE worker_id='cleaner'").get().status,'declined');
  assert.equal(f.db.raw.prepare("SELECT status FROM applications WHERE user_id='cleaner' AND job_id=?").get(f.job.id).status,'rejected');
 }finally{f.db.close();}
});
