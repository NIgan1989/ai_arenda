import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {commissionFor}=await load('platform-billing');
const {planState}=await load('autopilot-plans');

// One tariff in percent (decision of 2026-11-22): the owner 4% of a booking (at most 15 000 ₸ for one booking),
// the performer 5% of a cleaning; nothing else.
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

test('the prices after the change: 4% and at most 15 000 ₸ a booking for the owner, 5% for the performer, no other fee',async()=>{
 const f=await fixture();try{
  const s=f.db.raw.prepare("SELECT * FROM platform_billing WHERE id='global'").get();
  assert.deepEqual([s.rate_bp,s.max_fee,s.cleaner_rate_bp,s.cleaning_rate_bp,s.pair_rate_bp,s.ai_booking_fee,s.cleaner_job_fee],[400,15000,500,0,0,0,0]);
  // An hourly booking pays less by itself; a banquet stops at the cap.
  assert.equal(commissionFor(6000,s),240);assert.equal(commissionFor(12000,s),480);assert.equal(commissionFor(1000000,s),15000);
  const owner=await planState(f.owner,'owner'),cleaner=await planState(f.cleaner,'cleaner');
  assert.match(owner.terms.pay,/^Тариф: 4% с каждой брони/);assert.match(cleaner.terms.pay,/5% с каждой выполненной уборки/);
 }finally{f.db.close();}
});

test('the performer pays 5% of every accepted cleaning, a regular pair too; the object\'s own staff pays nothing',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  let job=accepted(f);assert.deepEqual([fee(f,job).amount,fee(f,job).mode,fee(f,job).user_id],[200,'shadow','cleaner']);
  R.prepare("UPDATE platform_billing SET plan_charge=1").run();
  job=accepted(f,{fee:2500});assert.deepEqual([fee(f,job).amount,fee(f,job).mode],[125,'charged'],'a light cleaning after hours costs less');
  assert.equal(R.prepare('SELECT amount FROM cleaning_commissions WHERE job_id=?').get(job).amount,0,'the owner pays no match fee');
  R.prepare('INSERT INTO regular_cleaners(property_id,owner_id,cleaner_id,created_at) VALUES (?,?,?,?)').run(f.property,'owner','cleaner',now());
  assert.equal(fee(f,accepted(f)).amount,200);
  R.prepare('DELETE FROM regular_cleaners').run();
  R.prepare('INSERT INTO property_staff(property_id,staff_id,owner_id,created_at) VALUES (?,?,?,?)').run(f.property,'cleaner','owner',now());
  assert.equal(fee(f,accepted(f)),undefined);
 }finally{f.db.close();}
});

test('a banquet hall pays in steps: 2% of the first 300 000 ₸, 1% up to 1 000 000 ₸, 0,5% above, at most 15 000 ₸',async()=>{
 const {accrueCommission}=await load('platform-billing'),f=await fixture(),R=f.db.raw;try{
  const audit=R.prepare('SELECT id FROM audit_events LIMIT 1').get().id;
  const again=async amount=>{R.prepare('DELETE FROM platform_commissions WHERE booking_id=?').run(f.booking);R.prepare('UPDATE bookings SET amount=? WHERE id=?').run(amount,f.booking);await accrueCommission(f.db,f.booking,audit,now()).run();return R.prepare('SELECT rate_bp,amount FROM platform_commissions WHERE booking_id=?').get(f.booking);};
  assert.deepEqual({...await again(12000)},{rate_bp:400,amount:480});
  R.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,'{\"type\":\"banquet\"}','r',?) ON CONFLICT(property_id) DO UPDATE SET details=json_set(details,'$.type','banquet')").run(f.property,now());
  assert.deepEqual({...await again(240000)},{rate_bp:200,amount:4800},'a memorial meal for 60 guests');
  assert.deepEqual({...await again(960000)},{rate_bp:200,amount:12600},'120 guests at 8 000 ₸: 6 000 + 6 600');
  assert.deepEqual({...await again(2000000)},{rate_bp:200,amount:15000},'a той for 250 guests stops at the cap');
 }finally{f.db.close();}
});

test('the hall scale has no jump and the guest names every kind of event',async()=>{
 const {hallFeeFor}=await load('platform-billing'),{statedOccasion}=await load('map-search-request'),{occasions}=await load('listings');
 assert.deepEqual([280000,300000,420000,1000000,1400000,3000000].map(a=>hallFeeFor(a)),[5600,6000,7200,13000,15000,15000]);
 for(let a=0;a<2000000;a+=10000)assert.ok(hallFeeFor(a+10000)>=hallFeeFor(a),'a bigger event never pays less');
 const said={'қыз ұзату в субботу':'uzatu','кыз узату':'uzatu','кудалык на 40 человек':'kudalyk','беташар':'betashar','сундет той сыну':'sundet','тусаукесер':'tusau','шилдехана':'besik',
  'свадьба на 200':'toi','день рождения папы':'birthday','детский праздник':'kids','корпоратив отдела':'corporate','выпускной 11 класса':'graduation','новый год с семьёй':'newyear',
  'семинар на 50':'conference','юбилей 60 лет':'party','жетісі':'memorial','поминки на 80':'memorial'};
 for(const [text,id] of Object.entries(said)){assert.equal(statedOccasion(text),id,text);assert.ok(occasions[id],id);}
 assert.equal(Object.keys(occasions).length,16);
});
