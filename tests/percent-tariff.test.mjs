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
  assert.match(owner.terms.pay,/^Тариф: 4% с каждого заселения/);assert.match(cleaner.terms.pay,/5% с каждой выполненной уборки/);
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

test('«Мой дом»: the owner pays 5% of a cleaning of the own home, at least 300 ₸; the performer 5% as everywhere',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,'{\"type\":\"home\"}','r',?) ON CONFLICT(property_id) DO UPDATE SET details=json_set(details,'$.type','home')").run(f.property,now());
  const owner=job=>R.prepare('SELECT amount,rate_bp FROM cleaning_commissions WHERE job_id=?').get(job);
  let job=accepted(f,{fee:12000});assert.deepEqual({...owner(job)},{amount:600,rate_bp:500});assert.equal(fee(f,job).amount,600);
  job=accepted(f,{fee:4000});assert.deepEqual({...owner(job)},{amount:300,rate_bp:500},'the least for the service');
  job=accepted(f,{fee:200});assert.equal(owner(job).amount,200,'never more than the cleaning');
 }finally{f.db.close();}
});

test('a banquet hall pays nothing per booking: a fixed month by capacity, free without bookings and the first month',async()=>{
 const {accrueCommission,sweepHallMonths,hallMonthFee,previousMonth}=await load('platform-billing'),f=await fixture(),R=f.db.raw;try{
  const audit=R.prepare('SELECT id FROM audit_events LIMIT 1').get().id;
  const again=async amount=>{R.prepare('DELETE FROM platform_commissions WHERE booking_id=?').run(f.booking);R.prepare('UPDATE bookings SET amount=? WHERE id=?').run(amount,f.booking);await accrueCommission(f.db,f.booking,audit,now()).run();return R.prepare('SELECT rate_bp,amount FROM platform_commissions WHERE booking_id=?').get(f.booking);};
  assert.deepEqual({...await again(12000)},{rate_bp:400,amount:480});
  R.prepare("INSERT INTO property_details(property_id,details,revision,updated_at) VALUES (?,'{\"type\":\"banquet\"}','r',?) ON CONFLICT(property_id) DO UPDATE SET details=json_set(details,'$.type','banquet')").run(f.property,now());
  assert.deepEqual({...await again(2000000)},{rate_bp:0,amount:0},'a той for 250 guests: no percent');
  const s={hall_small_upto:100,hall_mid_upto:300,hall_fee_small:9900,hall_fee_mid:19900,hall_fee_large:29900};
  assert.deepEqual([60,100,101,300,301,800].map(c=>hallMonthFee(c,s)),[9900,9900,19900,19900,29900,29900]);
  R.prepare('UPDATE properties SET capacity=200 WHERE id=?').run(f.property);
  R.prepare("UPDATE platform_billing SET enabled=1,starts_at=0").run();
  const month=b=>R.prepare("SELECT amount,mode FROM service_fees WHERE kind='hall_month' AND ref_id=?").get(f.property+':'+previousMonth(b).name);
  // The booking was confirmed now: the next month's sweep writes this month, the first with bookings: free.
  const d=new Date((now()+18000)*1000),start=k=>Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+k,1)/1000-18000+86400,next=start(1),later=start(2);
  await sweepHallMonths(f.db,now());assert.equal(month(now()),undefined,'a month without bookings costs nothing');
  // The event took place this month: it started on the 2nd and is over.
  const held=start(0)+86400;R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(held,held+7200,held+7200,f.booking);
  await sweepHallMonths(f.db,next);assert.deepEqual({...month(next)},{amount:19900,mode:'free'});
  await sweepHallMonths(f.db,next);assert.equal(R.prepare("SELECT COUNT(*) n FROM service_fees WHERE kind='hall_month'").get().n,1,'once a month');
  // A month later, with a new booking that month: the hall had bookings before, so this month is charged.
  const cols=R.prepare('PRAGMA table_info(bookings)').all().map(c=>c.name).filter(c=>c!=='id'&&c!=='request_key');
  R.prepare(`INSERT INTO bookings(id,request_key,${cols.join(',')}) SELECT 'second','second',${cols.map(c=>['start','end','occupied_until'].includes(c)?'?+'+c+'-start':c).join(',')} FROM bookings WHERE id=?`).run(...cols.filter(c=>['start','end','occupied_until'].includes(c)).map(()=>previousMonth(later).start+86400),f.booking);
  R.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at,managed) SELECT 'second',owner_id,property_id,booking_amount,0,0,mode,settings_version,?,managed FROM platform_commissions WHERE booking_id=?").run(previousMonth(later).start+3600,f.booking);
  R.prepare("UPDATE bookings SET status='completed' WHERE id='second'").run();
  await sweepHallMonths(f.db,later);assert.deepEqual({...month(later)},{amount:19900,mode:'charged'});
  assert.ok(R.prepare("SELECT 1 FROM notifications WHERE dedupe=?").get('owner:hall-month:'+f.property+':'+previousMonth(later).name));
 }finally{f.db.close();}
});

test('the guest names every kind of event',async()=>{
 const {statedOccasion}=await load('map-search-request'),{occasions}=await load('listings');
 const said={'қыз ұзату в субботу':'uzatu','кыз узату':'uzatu','кудалык на 40 человек':'kudalyk','беташар':'betashar','сундет той сыну':'sundet','тусаукесер':'tusau','шилдехана':'besik',
  'свадьба на 200':'toi','день рождения папы':'birthday','детский праздник':'kids','корпоратив отдела':'corporate','выпускной 11 класса':'graduation','новый год с семьёй':'newyear',
  'семинар на 50':'conference','юбилей 60 лет':'party','жетісі':'memorial','поминки на 80':'memorial'};
 for(const [text,id] of Object.entries(said)){assert.equal(statedOccasion(text),id,text);assert.ok(occasions[id],id);}
 assert.equal(Object.keys(occasions).length,16);
});
