import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');
const {payroll,monthKey,shiftMonth}=await load('company-finance');
const config=f=>({PLATFORM_ADMIN_IDS:f.other.userId});
const settings={opv_bp:1000,vosms_employee_bp:200,ipn_bp:1000,ipn_deduction_mrp:30,mrp:4325,sn_bp:600,so_bp:500,opvr_bp:350,vosms_employer_bp:300};

test('payroll follows the 2026 rates: withheld from the employee and paid on top by the employer',()=>{
 const p=payroll(500000,settings);
 assert.equal(p.opv,50000);assert.equal(p.vosms_employee,10000);
 assert.equal(p.ipn,Math.round((500000-50000-10000-30*4325)*0.1));
 assert.equal(p.net,500000-50000-10000-p.ipn);
 assert.equal(p.sn,30000);assert.equal(p.so,22500);assert.equal(p.opvr,17500);assert.equal(p.vosms_employer,15000);
 assert.equal(payroll(50000,settings).ipn,0,'the standard deduction leaves a small salary without ИПН');
});

test('the three reports reconcile: assets equal liabilities plus equity in fact and forecast',async()=>{
 const f=await fixture();try{
  await assert.rejects(readPlatformAdmin(f.owner,'finance',{},config(f)),e=>e.status===403);
  await writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:10,minFee:0,maxFee:0,startsAt:now(),freeBookings:0,expectedVersion:1},config(f));
  const id=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+3*86400),end:iso(now()+3*86400+7200),guests:1,billingMode:'hourly',requestKey:'cf1',acceptTerms:true})).id;
  await f.owner.bookingAction(id,{action:'confirm',cleaningFee:0});
  const fee=f.db.raw.prepare('SELECT amount FROM platform_commissions WHERE booking_id=?').get(id).amount;assert.ok(fee>0);
  await writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'topup',amount:50000,note:'Kaspi',requestKey:'t1'},config(f));
  await writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'bonus',amount:2000,note:'Подарок',requestKey:'t2'},config(f));
  // A cleaner's money: a paid cleaning with the «Автопилот» fee withheld, and a reserved one still owed.
  const at=now();
  f.db.raw.prepare("INSERT INTO cleaning_holds(job_id,owner_id,cleaner_id,property_id,amount,status,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?)").run(f.job.id,'owner','cleaner',f.property,3000,'paid',at,at);
  f.db.raw.prepare("INSERT INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,withheld,mode,settled_at,created_at) VALUES ('ap1','cleaner','cleaner',?,?,1,1900,1000,'charged',?,?)").run(at,at+86400,at,at);
  f.db.raw.prepare("INSERT INTO cleaning_commissions(job_id,owner_id,cleaner_id,property_id,fee,rate_bp,amount,pair,mode,created_at) VALUES (?,?,?,?,3000,1000,300,0,'charged',?)").run(f.job.id,'owner','cleaner',f.property,at);

  const month=monthKey();
  await writePlatformAdmin(f.other,'finance/cost',{kind:'service',name:'Хостинг',amount:'10',currency:'USD',period:'month',startMonth:month},config(f));
  await writePlatformAdmin(f.other,'finance/cost',{kind:'opex',name:'Ноутбук в рассрочку',amount:'120000',period:'year',startMonth:month},config(f));
  await writePlatformAdmin(f.other,'finance/cash',{kind:'capital',amount:'1000000',month},config(f));
  await writePlatformAdmin(f.other,'finance/cash',{kind:'asset',amount:'300000',month},config(f));
  await writePlatformAdmin(f.other,'finance/cash',{kind:'loan',amount:'200000',month},config(f));
  await assert.rejects(writePlatformAdmin(f.other,'finance/cash',{kind:'gift',amount:'1',month},config(f)),/Выберите/);

  for(const basis of ['fact','forecast'])for(const m of [month,shiftMonth(month,3)]){
   const state=await readPlatformAdmin(f.other,'finance',{basis,month:m},config(f));
   assert.equal(state.balance.difference,0,`${basis} ${m}: баланс сходится`);
  }
  const fact=await readPlatformAdmin(f.other,'finance',{basis:'fact',month},config(f));
  const pl=fact.current.pl;
  assert.equal(pl.bookings,fee);assert.equal(pl.cleaning,300);assert.equal(pl.autopilot,1900);assert.equal(pl.bonuses,2000);
  assert.equal(pl.services,Math.round(10*fact.settings.usd_rate)+Math.round(20*fact.settings.usd_rate)+170000,'the seeded Stadia Maps and AI subscriptions plus the new hosting');assert.equal(pl.opex,10000);
  const director=payroll(500000,fact.settings);assert.equal(pl.salaries,500000);assert.equal(pl.outsource,120000);
  assert.equal(pl.employer,director.sn+director.so+director.opvr+director.vosms_employer);
  assert.equal(pl.profit_tax,0,'a loss carries no profit tax');
  assert.equal(fact.current.cf.inflow,50000);assert.equal(fact.current.cf.payouts,2000);
  assert.equal(fact.balance.assets.cleaners,900);assert.equal(fact.balance.liabilities.loans,200000);
  assert.equal(fact.balance.liabilities.owners,50000+2000-fee-300-3000);
  assert.equal(fact.balance.liabilities.taxes,director.ipn+director.opv+director.vosms_employee+director.sn+director.so+director.opvr+director.vosms_employer);
  assert.equal(fact.balance.equity.capital,100000+1000000);

  // Turning a cost off removes it from the reports; a profitable forecast accrues КПН on the year's profit.
  for(const c of fact.costs.filter(c=>c.active))await writePlatformAdmin(f.other,'finance/cost/toggle',{id:c.id,active:false},config(f));
  const lean=await readPlatformAdmin(f.other,'finance',{basis:'forecast',month},config(f));
  assert.equal(lean.current.pl.salaries,0);assert.ok(lean.current.pl.operating>0);
  assert.equal(lean.current.pl.profit_tax,Math.round(lean.current.pl.operating*0.2));
  assert.equal(lean.balance.difference,0);
 }finally{f.db.close();}
});

test('settings are validated and versioned',async()=>{
 const f=await fixture();try{
  const state=await readPlatformAdmin(f.other,'finance',{},config(f));
  const body={expectedVersion:1,startMonth:'2026-11',taxRegime:'simplified',cit:20,simplified:4,vatRegistered:false,vat:16,vatThresholdMrp:10000,mrp:4325,usdRate:500,opv:10,vosmsEmployee:2,ipn:10,ipnDeductionMrp:30,sn:6,so:5,opvr:3.5,vosmsEmployer:3,acquiring:1.5,shareCapital:100000};
  await assert.rejects(writePlatformAdmin(f.other,'finance/settings',{...body,cit:80},config(f)),/КПН/);
  await writePlatformAdmin(f.other,'finance/settings',body,config(f));
  await assert.rejects(writePlatformAdmin(f.other,'finance/settings',body,config(f)),e=>e.status===409);
  const after=await readPlatformAdmin(f.other,'finance',{},config(f));
  assert.equal(after.settings.tax_regime,'simplified');assert.equal(after.settings.opvr_bp,350);assert.equal(after.settings.usd_rate,500);assert.equal(state.settings.version+1,after.settings.version);
 }finally{f.db.close();}
});

test('accounting lists what is owed, a payment lands in ДДС and keeps the balance whole',async()=>{
 const f=await fixture();try{
  const month=monthKey();
  let state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  const payrollDue=state.obligations.find(o=>o.group==='payroll'&&o.period===month);
  const p=payroll(500000,{...settings});
  assert.equal(payrollDue.accrued,p.ipn+p.opv+p.vosms_employee+p.sn+p.so+p.opvr+p.vosms_employer);
  assert.equal(payrollDue.due,shiftMonth(month,1)+'-25');
  await assert.rejects(writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:payrollDue.accrued+1,month,confirmed:true},config(f)),/допустимо/);
  await writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:100000,month,confirmed:true},config(f));
  state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  const after=state.obligations.find(o=>o.key===payrollDue.key);assert.equal(after.paid,100000);assert.equal(after.left,payrollDue.accrued-100000);
  await writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:after.left,month,confirmed:true},config(f));
  state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  assert.equal(state.obligations.find(o=>o.key===payrollDue.key).status,'paid');
  await assert.rejects(writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:1,month,confirmed:true},config(f)),e=>e.status===409);
  assert.equal(state.totals.paidYear,payrollDue.accrued);
  const fin=await readPlatformAdmin(f.other,'finance',{basis:'fact',month},config(f));
  assert.equal(fin.current.cf.taxes_paid,payrollDue.accrued);assert.equal(fin.balance.liabilities.taxes,0);assert.equal(fin.balance.difference,0);
  // The journal is limited to the latest rows, the reconciliation is not: many small payments still add up.
  const next=shiftMonth(month,1);
  for(let i=0;i<230;i++)f.db.raw.prepare("INSERT INTO company_tax_payments(id,tax,period,amount,month,note,created_at) VALUES (?,?,?,?,?,?,?)").run('many'+i,'opv',next,1,month,'',now()+i);
  state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  assert.equal(state.payments.length,200);assert.equal(state.totals.paidYear,payrollDue.accrued+230);
 }finally{f.db.close();}
});
