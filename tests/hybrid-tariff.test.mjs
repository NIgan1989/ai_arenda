import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {dueOf}=await load('service-dues');
const {planState,startCleanerPlan}=await load('autopilot-plans');
const {writeOperations}=await load('operations-api');

// A copy of the fixture's cleaning, assigned to the performer and accepted at once: the trigger writes the fees.
let n=0;
function accepted(f,{fee=4000}={}){
 const R=f.db.raw,id=f.job.id+'-'+(++n);
 R.exec('PRAGMA foreign_keys=OFF');
 R.prepare('INSERT INTO cleaning_jobs SELECT ?,'+R.prepare('PRAGMA table_info(cleaning_jobs)').all().slice(1).map(c=>c.name==='booking_id'?'NULL':['start','end'].includes(c.name)?c.name+'+'+(n*86400*2):c.name).join(',')+' FROM cleaning_jobs WHERE id=?').run(id,f.job.id);
 R.exec('PRAGMA foreign_keys=ON');
 R.prepare("UPDATE cleaning_jobs SET fee=?,assigned_to='cleaner',status='submitted' WHERE id=?").run(fee,id);
 R.prepare("UPDATE cleaning_jobs SET status='completed' WHERE id=?").run(id);
 return id;
}
const fee=(f,job)=>f.db.raw.prepare("SELECT * FROM service_fees WHERE kind='cleaning' AND ref_id=?").get(job);

test('the performer pays 250 ₸ per accepted cleaning: the first ones free, a monthly cap, nothing for a regular pair or under «Всё включено»',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  // Charging off: only a forecast, and it does not use up the free cleanings.
  let job=accepted(f);assert.deepEqual([fee(f,job).amount,fee(f,job).mode,fee(f,job).user_id],[250,'shadow','cleaner']);
  R.prepare("UPDATE platform_billing SET plan_charge=1,cleaner_free_jobs=2,cleaner_month_cap=600").run();
  assert.equal(fee(f,accepted(f)).mode,'free');assert.equal(fee(f,accepted(f)).mode,'free');
  assert.deepEqual([fee(f,job=accepted(f)).amount,fee(f,job).mode],[250,'charged']);assert.equal(await dueOf(f.db,'cleaner'),250);
  assert.equal(fee(f,accepted(f)).amount,250);assert.equal(fee(f,accepted(f)).amount,100,'the cap of 600 ₸ a month');assert.equal(fee(f,accepted(f)).amount,0);
  assert.equal(await dueOf(f.db,'cleaner'),600);
  // A regular pair pays the owner's lower commission instead.
  R.prepare('INSERT INTO regular_cleaners(property_id,owner_id,cleaner_id,created_at) VALUES (?,?,?,?)').run(f.property,'owner','cleaner',now());
  assert.equal(fee(f,accepted(f)),undefined);
  R.prepare('DELETE FROM regular_cleaners').run();
  // «Всё включено» for the performer: no fee per cleaning; for the owner: no match fee.
  await startCleanerPlan(f.cleaner,{districts:[],days:127,fromMinute:0,toMinute:1440,minFee:0,maxPerDay:4,askNewOwner:false});
  await writeOperations(f.cleaner,'cleaner',['autopilot','tier'],{tier:'all'});
  R.prepare("INSERT INTO autopilot_plans(user_id,role,status,started_at,period_end,updated_at,tier) VALUES ('owner','owner','active',?,?,?,'all')").run(now(),now()+30*86400,now());
  job=accepted(f);assert.equal(fee(f,job),undefined);assert.equal(R.prepare('SELECT amount FROM cleaning_commissions WHERE job_id=?').get(job).amount,0);
 }finally{f.db.close();}
});

test('the app suggests «Всё включено» when the last 30 days for the result cost more',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE platform_billing SET cleaner_free_jobs=0").run();
  await writeOperations(f.owner,'owner',['autopilot','start'],{propertyIds:[f.property],cleaningFees:{[f.property]:3000}});
  // The fixture already has its own fees: the subscription is priced just above them.
  let state=await planState(f.owner,'owner');const base=state.billing.spent30;
  R.prepare("UPDATE platform_billing SET plan_owner_price=?").run(base+1000);
  state=await planState(f.owner,'owner');assert.equal(state.billing.allAmount,base+1000);assert.equal(state.billing.advise,false);
  accepted(f,{fee:12000});
  state=await planState(f.owner,'owner');assert.equal(state.billing.spent30,base+1200);assert.equal(state.billing.advise,true,'the result cost more than the subscription');
  const cleaner=await planState(f.cleaner,'cleaner');assert.equal(cleaner.billing.spent30,250);assert.equal(cleaner.billing.allAmount,2900);assert.equal(cleaner.billing.advise,false);
 }finally{f.db.close();}
});
