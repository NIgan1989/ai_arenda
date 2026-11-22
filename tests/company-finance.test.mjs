import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {readPlatformAdmin,writePlatformAdmin}=await load('platform-admin');
const {payroll,selfContributions,monthKey,shiftMonth}=await load('company-finance');
const config=f=>({PLATFORM_ADMIN_IDS:f.other.userId});
const settings={entity:'ip',tax_regime:'general',mzp:85000,owner_base:85000,vosms_self_bp:500,opv_bp:1000,vosms_employee_bp:200,ipn_bp:1000,ipn_deduction_mrp:30,mrp:4325,sn_bp:600,so_bp:500,opvr_bp:350,vosms_employer_bp:300};

test('payroll follows the 2026 rates: withheld from the employee and paid on top by the employer',()=>{
 const p=payroll(500000,settings);
 assert.equal(p.opv,50000);assert.equal(p.vosms_employee,10000);
 assert.equal(p.ipn,Math.round((500000-50000-10000-30*4325)*0.1));
 assert.equal(p.net,500000-50000-10000-p.ipn);
 assert.equal(p.sn,30000);assert.equal(p.so,22500);assert.equal(p.opvr,17500);assert.equal(p.vosms_employer,15000);
 assert.equal(payroll(50000,settings).ipn,0,'the standard deduction leaves a small salary without ИПН');
 assert.equal(payroll(500000,{...settings,tax_regime:'simplified'}).sn,0,'no social tax on the simplified declaration');
 assert.deepEqual(selfContributions(settings),{self_opv:8500,self_opvr:2975,self_so:4250,self_vosms:5950});
 assert.equal(selfContributions({...settings,owner_base:200000}).self_opv,20000);
 assert.equal(selfContributions({...settings,entity:'too'}).self_opv,0);
});

const settingsBody={entity:'ip',companyName:'AiQonaq',mzp:85000,ownerBase:85000,vosmsSelf:5,startMonth:'2026-11',taxRegime:'simplified',cit:20,simplified:4,vatRegistered:false,vat:16,vatThresholdMrp:10000,mrp:4325,usdRate:500,opv:10,vosmsEmployee:2,ipn:10,ipnDeductionMrp:30,sn:6,so:5,opvr:3.5,vosmsEmployer:3,acquiring:0.95,shareCapital:0};

test('the three reports reconcile: assets equal liabilities plus equity in fact and forecast',async()=>{
 const f=await fixture();try{
  await assert.rejects(readPlatformAdmin(f.owner,'finance',{},config(f)),e=>e.status===403);
  await writePlatformAdmin(f.other,'billing/settings',{confirmed:true,enabled:true,ratePercent:10,minFee:0,maxFee:0,startsAt:now(),freeBookings:0,expectedVersion:1},config(f));
  const id=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+3*86400),end:iso(now()+3*86400+7200),guests:1,billingMode:'hourly',requestKey:'cf1',acceptTerms:true})).id;
  await f.owner.bookingAction(id,{action:'confirm',cleaningFee:0});
  const fee=f.db.raw.prepare('SELECT amount FROM platform_commissions WHERE booking_id=?').get(id).amount;assert.ok(fee>0);
  await writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'topup',amount:50000,note:'Kaspi',requestKey:'t1',bankRef:'KP-1'},config(f));
  await writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'bonus',amount:2000,note:'Подарок',requestKey:'t2'},config(f));
  // A cleaner's money: a paid cleaning with part of the «Автопилот» fee withheld (the charge is not settled yet).
  const at=now();
  f.db.raw.prepare("INSERT INTO cleaning_holds(job_id,owner_id,cleaner_id,property_id,amount,status,created_at,paid_at) VALUES (?,?,?,?,?,?,?,?)").run(f.job.id,'owner','cleaner',f.property,3000,'paid',at,at);
  f.db.raw.prepare("INSERT INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,withheld,mode,settled_at,created_at) VALUES ('ap1','cleaner','cleaner',?,?,1,1900,1000,'charged',NULL,?)").run(at,at+86400,at);
  f.db.raw.prepare("INSERT INTO cleaning_commissions(job_id,owner_id,cleaner_id,property_id,fee,rate_bp,amount,pair,mode,created_at) VALUES (?,?,?,?,3000,1000,300,0,'charged',?)").run(f.job.id,'owner','cleaner',f.property,at);

  // Direct payments: a cleaner tops up a balance of their own and the fee is taken from it at once.
  const entry=f.db.raw.prepare("SELECT * FROM owner_balance_entries WHERE kind='topup' LIMIT 1").get();
  const cols=Object.keys(entry),copy={...entry,id:'cleaner-topup',owner_id:'cleaner',amount:5000,request_key:'ct1',bank_ref:''};
  f.db.raw.prepare(`INSERT INTO owner_balance_entries(${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>copy[c]));
  f.db.raw.prepare("INSERT INTO autopilot_charges(id,user_id,role,period_start,period_end,units,amount,withheld,mode,settled_at,created_at) VALUES ('ap2','cleaner','cleaner',?,?,1,700,0,'charged',?,?)").run(at+86400,at+2*86400,at,at);

  const month=monthKey();
  await writePlatformAdmin(f.other,'finance/cost',{kind:'staff',employment:'employee',name:'Оператор',amount:'500000',period:'month',startMonth:month},config(f));
  await writePlatformAdmin(f.other,'finance/cost',{kind:'service',name:'Хостинг',amount:'10',currency:'USD',period:'month',startMonth:month},config(f));
  await writePlatformAdmin(f.other,'finance/cost',{kind:'opex',name:'Ноутбук в рассрочку',amount:'120000',period:'year',startMonth:month},config(f));
  await writePlatformAdmin(f.other,'finance/cash',{kind:'capital',amount:'1000000',month},config(f));
  await writePlatformAdmin(f.other,'finance/cash',{kind:'asset',amount:'300000',month},config(f));
  await writePlatformAdmin(f.other,'finance/cash',{kind:'loan',amount:'200000',month},config(f));
  await assert.rejects(writePlatformAdmin(f.other,'finance/cash',{kind:'gift',amount:'1',month},config(f)),/Выберите/);
  // A real payment of a cost from the bank (accounting audit, point 2): «Факт» ДДС shows it, the unpaid rest is owed.
  const operator=(await readPlatformAdmin(f.other,'finance',{},config(f))).costs.find(c=>c.name==='Оператор');
  await writePlatformAdmin(f.other,'finance/cost-payment',{costId:operator.id,month,amount:'100000',bankRef:'CP-1'},config(f));
  await assert.rejects(writePlatformAdmin(f.other,'finance/cost-payment',{costId:operator.id,month,amount:'100000',bankRef:'CP-1'},config(f)),e=>e.status===409);
  await assert.rejects(writePlatformAdmin(f.other,'finance/cost/delete',{id:operator.id,confirmed:true},config(f)),e=>e.status===409);
  // A payment made before the books start still counts: the reports begin with its month.
  const early=shiftMonth((await readPlatformAdmin(f.other,'finance',{},config(f))).first,-1);
  await writePlatformAdmin(f.other,'finance/cost-payment',{costId:operator.id,month:early,amount:'5000',bankRef:'CP-0'},config(f));
  const before=await readPlatformAdmin(f.other,'finance',{basis:'fact',month:early},config(f));assert.equal(before.month,early);assert.equal(before.current.cf.costs_paid,5000);

  for(const basis of ['fact','forecast'])for(const m of [month,shiftMonth(month,3)]){
   const state=await readPlatformAdmin(f.other,'finance',{basis,month:m},config(f));
   assert.equal(state.balance.difference,0,`${basis} ${m}: баланс сходится`);
  }
  const fact=await readPlatformAdmin(f.other,'finance',{basis:'fact',month},config(f));
  const pl=fact.current.pl;
  // The stay is three days ahead: its commission is not earned yet in «Факт», the plan already counts it (accounting audit, point 1).
  assert.equal(pl.bookings,0);assert.ok((await readPlatformAdmin(f.other,'finance',{basis:'forecast',month},config(f))).current.pl.bookings>=fee);assert.equal(pl.cleaning,300);assert.equal(pl.autopilot,2600);assert.equal(pl.bonuses,2000);
  assert.equal(pl.services,Math.round(10*fact.settings.usd_rate)+Math.round(20*fact.settings.usd_rate)+170000,'the seeded Stadia Maps and AI subscriptions plus the new hosting');assert.equal(pl.opex,10000);
  const director=payroll(500000,fact.settings),self=selfContributions(fact.settings),selfTotal=self.self_opv+self.self_opvr+self.self_so+self.self_vosms;
  assert.equal(fact.settings.entity,'ip');assert.equal(fact.settings.tax_regime,'simplified');assert.equal(director.sn,0);
  assert.equal(pl.salaries,500000);assert.equal(pl.outsource,30000);assert.equal(pl.self,selfTotal);assert.equal(selfTotal,21675);
  assert.equal(pl.employer,director.sn+director.so+director.opvr+director.vosms_employer);
  assert.equal(pl.profit_tax,Math.round(pl.revenue*0.04),'the simplified declaration taxes income, not profit');
  assert.equal(fact.current.cf.inflow,55000);assert.equal(fact.current.cf.payouts,2000);assert.equal(fact.current.cf.costs_paid,100000);assert.ok(fact.balance.liabilities.suppliers>0);
  assert.equal(fact.balance.assets.cleaners,900);assert.equal(fact.balance.liabilities.loans,200000);
  assert.equal(fact.balance.liabilities.owners,50000+2000-300-3000+5000-700);
  // Once the guest has stayed the commission is earned in the month the stay began, and the books still reconcile.
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(id);
  const stayMonth=monthKey(now()+3*86400),stayed=await readPlatformAdmin(f.other,'finance',{basis:'fact',month:stayMonth},config(f));
  assert.equal(stayed.current.pl.bookings,fee);assert.equal(stayed.balance.difference,0);
  assert.equal(fact.balance.liabilities.taxes,director.ipn+director.opv+director.vosms_employee+director.sn+director.so+director.opvr+director.vosms_employer+selfTotal+pl.profit_tax);
  assert.equal(fact.balance.equity.capital,1000000);

  // Turning a cost off removes it from the reports; a ТОО on the general regime accrues КПН on the year's profit.
  for(const c of fact.costs.filter(c=>c.active))await writePlatformAdmin(f.other,'finance/cost/toggle',{id:c.id,active:false},config(f));
  await writePlatformAdmin(f.other,'finance/settings',{...settingsBody,expectedVersion:fact.settings.version,entity:'too',taxRegime:'general'},config(f));
  const lean=await readPlatformAdmin(f.other,'finance',{basis:'forecast',month},config(f));
  assert.equal(lean.current.pl.salaries,0);assert.equal(lean.current.pl.self,0);assert.ok(lean.current.pl.operating>0);
  assert.equal(lean.current.pl.profit_tax,Math.round(lean.current.pl.operating*0.2));
  assert.equal(lean.balance.difference,0);
 }finally{f.db.close();}
});

test('settings are validated and versioned',async()=>{
 const f=await fixture();try{
  const state=await readPlatformAdmin(f.other,'finance',{},config(f));
  const body={...settingsBody,expectedVersion:1,entity:'too',companyName:'Тест'};
  await assert.rejects(writePlatformAdmin(f.other,'finance/settings',{...body,cit:80},config(f)),/КПН/);
  await writePlatformAdmin(f.other,'finance/settings',body,config(f));
  await assert.rejects(writePlatformAdmin(f.other,'finance/settings',body,config(f)),e=>e.status===409);
  const after=await readPlatformAdmin(f.other,'finance',{},config(f));
  assert.equal(after.settings.entity,'too');assert.equal(after.settings.company_name,'Тест');assert.equal(after.settings.acquiring_bp,95);assert.equal(after.settings.opvr_bp,350);assert.equal(after.settings.usd_rate,500);assert.equal(state.settings.version+1,after.settings.version);
 }finally{f.db.close();}
});

test('accounting lists what is owed, a payment lands in ДДС and keeps the balance whole',async()=>{
 const f=await fixture();try{
  const month=monthKey();
  let state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  const payrollDue=state.obligations.find(o=>o.group==='self'&&o.period===month);
  assert.equal(state.obligations.some(o=>o.group==='payroll'),false,'no employees yet: only the owner pays for himself');
  assert.equal(payrollDue.accrued,21675);assert.equal(payrollDue.name,'Взносы ИП за себя');
  assert.equal(state.obligations.some(o=>o.group==='simplified'),false,'no charged income yet, so no income tax');
  assert.equal(payrollDue.due,shiftMonth(month,1)+'-25');
  await assert.rejects(writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:payrollDue.accrued+1,month,confirmed:true},config(f)),/допустимо/);
  await assert.rejects(writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:10000,month,confirmed:true},config(f)),/банковского документа/);
  await writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:10000,month,bankRef:'PP-1',confirmed:true},config(f));
  // The same bank payment cannot be recorded twice (accounting audit, point 3).
  await assert.rejects(writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:100,month,bankRef:'PP-1',confirmed:true},config(f)),e=>e.status===409);
  state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  const after=state.obligations.find(o=>o.key===payrollDue.key);assert.equal(after.paid,10000);assert.equal(after.left,payrollDue.accrued-10000);
  await writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:after.left,month,bankRef:'PP-2',confirmed:true},config(f));
  state=await readPlatformAdmin(f.other,'accounting',{},config(f));
  assert.equal(state.obligations.find(o=>o.key===payrollDue.key).status,'paid');
  await assert.rejects(writePlatformAdmin(f.other,'accounting/pay',{key:payrollDue.key,amount:1,month,bankRef:'PP-3',confirmed:true},config(f)),e=>e.status===409);
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
