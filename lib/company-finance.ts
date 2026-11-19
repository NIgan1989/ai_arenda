import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';

// The service's own books for the platform administrator: P&L (ОПИУ), cash flow (ДДС) and the
// balance sheet. Revenue is read from the commission tables, costs and tax assumptions are kept
// in company_* tables. Every figure is a whole tenge and every month is a calendar month in
// Kazakhstan time, so the three reports reconcile to the tenge: assets = liabilities + equity.

export type Basis='fact'|'forecast';
export type FinanceSettings={entity:'ip'|'too';company_name:string;mzp:number;owner_base:number;vosms_self_bp:number;start_month:string;tax_regime:'general'|'simplified';cit_bp:number;simplified_bp:number;vat_registered:number;vat_bp:number;vat_threshold_mrp:number;mrp:number;usd_rate:number;opv_bp:number;vosms_employee_bp:number;ipn_bp:number;ipn_deduction_mrp:number;sn_bp:number;so_bp:number;opvr_bp:number;vosms_employer_bp:number;acquiring_bp:number;share_capital:number;version:number;updated_at:number};
export type Cost={id:string;kind:'staff'|'service'|'opex';name:string;amount:number;currency:'KZT'|'USD';period:'month'|'year'|'once';employment:'none'|'employee'|'outsource';start_month:string;end_month:string|null;active:number;note:string;sort:number};
export type Payroll={gross:number;opv:number;vosms_employee:number;ipn:number;net:number;sn:number;so:number;opvr:number;vosms_employer:number};
export const payrollTaxes=['ipn','opv','vosms_employee','sn','so','opvr','vosms_employer'] as const;
export const selfTaxes=['self_opv','self_opvr','self_so','self_vosms'] as const;
// Income ceiling of the simplified declaration, in МРП a year (2026 Tax Code).
export const SIMPLIFIED_LIMIT_MRP=600000;
export const taxNames:Record<string,string>={cit:'КПН',simplified:'Налог по упрощённой декларации',vat:'НДС',ipn:'ИПН с зарплат',opv:'ОПВ (пенсионные)',vosms_employee:'ВОСМС работника',sn:'Социальный налог',so:'Социальные отчисления',opvr:'ОПВР работодателя',vosms_employer:'ООСМС работодателя',self_opv:'ОПВ ИП за себя',self_opvr:'ОПВР ИП за себя',self_so:'СО ИП за себя',self_vosms:'ВОСМС ИП за себя'};
const OFFSET=5*3600;
const live="(SELECT status FROM bookings WHERE id=c.booking_id) IN ('confirmed','completed')";
const monthOf=(column:string)=>`strftime('%Y-%m',${column}+${OFFSET},'unixepoch')`;
const monthRe=/^\d{4}-(0[1-9]|1[0-2])$/;

export const pct=(amount:number,bp:number)=>Math.round(amount*bp/10000);
export function monthKey(at=epoch()){return new Date((at+OFFSET)*1000).toISOString().slice(0,7);}
export function shiftMonth(key:string,by:number){const [y,m]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1+by,1)).toISOString().slice(0,7);}
export function monthEnd(key:string){const [y,m]=key.split('-').map(Number);return Date.UTC(y,m,1)/1000-OFFSET-1;}
function monthsBetween(from:string,to:string){const out:string[]=[];for(let k=from;k<=to&&out.length<600;k=shiftMonth(k,1))out.push(k);return out;}

// Payroll of one employee for a month under the 2026 Tax Code of Kazakhstan (rates come from
// the settings, so a change in law is a settings change). Ceilings on the bases are not applied.
export function payroll(gross:number,s:FinanceSettings):Payroll{
 const opv=pct(gross,s.opv_bp),vosms_employee=pct(gross,s.vosms_employee_bp);
 const ipn=pct(Math.max(0,gross-opv-vosms_employee-s.ipn_deduction_mrp*s.mrp),s.ipn_bp);
 return {gross,opv,vosms_employee,ipn,net:gross-opv-vosms_employee-ipn,sn:s.tax_regime==='simplified'?0:pct(gross,s.sn_bp),so:pct(Math.max(0,gross-opv),s.so_bp),opvr:pct(gross,s.opvr_bp),vosms_employer:pct(gross,s.vosms_employer_bp)};
}
// What an ИП pays for its owner every month: pension and social contributions from the base the
// owner declares (not below one minimum wage) and medical insurance from 1.4 minimum wages.
export function selfContributions(s:FinanceSettings){
 if(s.entity!=='ip')return {self_opv:0,self_opvr:0,self_so:0,self_vosms:0};
 const base=Math.max(s.owner_base,s.mzp);
 return {self_opv:pct(base,s.opv_bp),self_opvr:pct(base,s.opvr_bp),self_so:pct(base,s.so_bp),self_vosms:pct(Math.round(s.mzp*1.4),s.vosms_self_bp)};
}
// Monthly cost in tenge: a yearly payment is spread over twelve months, a one-off falls on its start month.
export const costTenge=(c:Pick<Cost,'amount'|'currency'>,s:Pick<FinanceSettings,'usd_rate'>)=>c.currency==='USD'?Math.round(c.amount*s.usd_rate/100):c.amount;
export function costInMonth(c:Cost,key:string,s:FinanceSettings){
 if(!c.active||key<c.start_month||(c.end_month&&key>c.end_month))return 0;
 if(c.period==='once'&&key!==c.start_month)return 0;
 const tenge=costTenge(c,s);
 return c.period==='year'?Math.round(tenge/12):tenge;
}

export async function financeSettings(db:D1Database){
 const s=await one(db,"SELECT * FROM company_finance_settings WHERE id='global'") as FinanceSettings|null;
 if(!s)throw new DomainError('Финансовые настройки не найдены. Примените обновление базы.',503);
 return s;
}

type Inputs={settings:FinanceSettings;costs:Cost[];revenue:Row;cash:Row;taxPaid:Row;cashEntries:Row[]};
async function inputs(db:D1Database):Promise<Inputs>{
 const [settings,costs,booking,cleaning,autopilot,withheld,balance,holds,ai,cash,taxPaid,first]=await Promise.all([
  financeSettings(db),
  rows(db,'SELECT * FROM company_costs ORDER BY kind,sort,created_at,id') as Promise<Cost[]>,
  rows(db,`SELECT ${monthOf('c.created_at')} month,COALESCE(SUM(CASE WHEN c.mode='charged' THEN c.amount END),0) charged,COALESCE(SUM(CASE WHEN c.mode='shadow' THEN c.amount END),0) shadow,COALESCE(SUM(CASE WHEN c.mode='charged' THEN c.booking_amount END),0) turnover_charged,COALESCE(SUM(CASE WHEN c.mode IN ('charged','shadow') THEN c.booking_amount END),0) turnover_all,COUNT(*) bookings FROM platform_commissions c WHERE ${live} GROUP BY month`),
  rows(db,`SELECT ${monthOf('created_at')} month,COALESCE(SUM(CASE WHEN mode='charged' THEN amount END),0) charged,COALESCE(SUM(CASE WHEN mode='shadow' THEN amount END),0) shadow FROM cleaning_commissions GROUP BY month`),
  rows(db,`SELECT ${monthOf('created_at')} month,COALESCE(SUM(CASE WHEN mode='charged' THEN amount END),0) charged,COALESCE(SUM(CASE WHEN mode='shadow' THEN amount END),0) shadow,COALESCE(SUM(CASE WHEN mode='charged' AND role='cleaner' THEN amount END),0) cleaner_charged FROM autopilot_charges GROUP BY month`),
  // A part-paid charge has no settlement date yet: its deductions count from the month it was charged.
  rows(db,`SELECT ${monthOf('COALESCE(settled_at,created_at)')} month,COALESCE(SUM(withheld),0) withheld FROM autopilot_charges WHERE role='cleaner' AND mode='charged' AND withheld>0 GROUP BY month`),
  rows(db,`SELECT ${monthOf('created_at')} month,COALESCE(SUM(CASE WHEN kind='topup' THEN amount END),0) topups,COALESCE(SUM(CASE WHEN kind<>'topup' THEN amount END),0) bonuses FROM owner_balance_entries GROUP BY month`),
  rows(db,`SELECT ${monthOf('paid_at')} month,COALESCE(SUM(amount),0) paid FROM cleaning_holds WHERE status='paid' AND paid_at IS NOT NULL GROUP BY month`),
  rows(db,`SELECT ${monthOf('created_at')} month,COALESCE(SUM(charged_cost_micros),0) micros,COUNT(*) requests FROM ai_usage_reservations WHERE charged_cost_micros IS NOT NULL GROUP BY month`),
  rows(db,'SELECT id,kind,amount,month,note,created_at FROM company_cash_entries ORDER BY month DESC,created_at DESC,id'),
  rows(db,'SELECT month,tax,COALESCE(SUM(amount),0) amount FROM company_tax_payments GROUP BY month,tax'),
  one(db,`SELECT (SELECT MIN(created_at) FROM platform_commissions) a,(SELECT MIN(created_at) FROM owner_balance_entries) b,(SELECT MIN(created_at) FROM cleaning_commissions) c,(SELECT MIN(created_at) FROM autopilot_charges) d,(SELECT MIN(month) FROM company_cash_entries) e,(SELECT MIN(month) FROM company_tax_payments) f`),
 ]);
 const index=(list:Row[])=>Object.fromEntries(list.map(r=>[r.month,r]));
 // D1 refuses long UNION chains, so the earliest month is picked here from one row of minimums.
 const firstMonth=[first?.a,first?.b,first?.c,first?.d].filter(v=>v!=null).map(v=>monthKey(Number(v))).concat([first?.e,first?.f].filter(Boolean)).sort()[0]||null;
 const revenue={booking:index(booking),cleaning:index(cleaning),autopilot:index(autopilot),ai:index(ai),first:firstMonth};
 const cashIndex={withheld:index(withheld),balance:index(balance),holds:index(holds)};
 const paid:Row={};for(const r of taxPaid){(paid[r.month]??={})[r.tax]=Number(r.amount);}
 return {settings,costs,revenue,cash:cashIndex,taxPaid:paid,cashEntries:cash};
}

export type Month={month:string;pl:Row;cf:Row;taxes:Row;paid:Row};
// One pass over every month from the first record: P&L and cash flow per month. The profit tax
// is accrued on the year's running profit, so a loss early in the year reduces later tax.
export function computeMonths(input:Inputs,basis:Basis,until:string):Month[]{
 const s=input.settings,r=input.revenue,c=input.cash;
 const start=[s.start_month,r.first||s.start_month].sort()[0];
 const out:Month[]=[];let ytdProfit=0,ytdCit=0,year='';
 for(const month of monthsBetween(start,until)){
  if(month.slice(0,4)!==year){year=month.slice(0,4);ytdProfit=0;ytdCit=0;}
  const b=r.booking[month]||{},cl=r.cleaning[month]||{},ap=r.autopilot[month]||{},ai=r.ai[month]||{};
  const fact=basis==='fact';
  const bookings=Number(b.charged||0)+(fact?0:Number(b.shadow||0)),cleaning=Number(cl.charged||0)+(fact?0:Number(cl.shadow||0)),autopilot=Number(ap.charged||0)+(fact?0:Number(ap.shadow||0));
  const gross=bookings+cleaning+autopilot,vat=s.vat_registered?Math.round(gross*s.vat_bp/(10000+s.vat_bp)):0,revenue=gross-vat;
  // Guests pay owners and owners pay cleaners directly, outside the service. Only the money that
  // reaches the business account (commissions and «Автопилот») carries the bank's commission.
  const inflow=fact?Number(c.balance[month]?.topups||0):gross;
  const acquiring=pct(inflow,s.acquiring_bp);
  const aiCost=Math.round(Number(ai.micros||0)*s.usd_rate/1e6);
  const bonuses=fact?Number(c.balance[month]?.bonuses||0):0;
  let salaries=0,employer=0,outsource=0,services=0,opex=0,net=0;const taxes:Row={ipn:0,opv:0,vosms_employee:0,sn:0,so:0,opvr:0,vosms_employer:0,cit:0,simplified:0,vat,...(month>=s.start_month?selfContributions(s):{})};
  const self=selfTaxes.reduce((a,k)=>a+Number(taxes[k]||0),0);
  for(const cost of input.costs){
   const amount=costInMonth(cost,month,s);if(!amount)continue;
   if(cost.kind==='staff'&&cost.employment==='employee'){const p=payroll(amount,s);salaries+=amount;net+=p.net;employer+=p.sn+p.so+p.opvr+p.vosms_employer;for(const k of payrollTaxes)taxes[k]+=p[k];}
   else if(cost.kind==='staff')outsource+=amount;
   else if(cost.kind==='service')services+=amount;
   else opex+=amount;
  }
  const gross_profit=revenue-acquiring-aiCost-bonuses;
  const operating=gross_profit-salaries-employer-self-outsource-services-opex;
  let profitTax=0;
  if(s.tax_regime==='simplified'){taxes.simplified=pct(revenue,s.simplified_bp);profitTax=taxes.simplified;}
  else{ytdProfit+=operating;const due=Math.max(0,pct(ytdProfit,s.cit_bp));taxes.cit=due-ytdCit;ytdCit=due;profitTax=taxes.cit;}
  const netProfit=operating-profitTax;
  const pl={bookings,cleaning,autopilot,gross,vat,revenue,acquiring,ai:aiCost,aiRequests:Number(ai.requests||0),bonuses,gross_profit,salaries,employer,self,outsource,services,opex,operating,profit_tax:profitTax,net:netProfit,turnover:Number(fact?b.turnover_charged:b.turnover_all)||0,bookingsCount:Number(b.bookings||0)};
  const paid=input.taxPaid[month]||{},taxesPaid=Object.values(paid).reduce((a:number,v)=>a+Number(v),0) as number;
  const entries=input.cashEntries.filter(e=>e.month===month),sum=(k:string)=>entries.filter(e=>e.kind===k).reduce((a,e)=>a+Number(e.amount),0);
  const payouts=fact?Number(c.holds[month]?.paid||0)-Number(c.withheld[month]?.withheld||0):0;
  const operatingCash=inflow-payouts-net-outsource-services-opex-acquiring-aiCost-taxesPaid;
  const capital=sum('capital')+(month===s.start_month?s.share_capital:0),loans=sum('loan'),repay=sum('loan_repay'),dividends=sum('dividend'),assets=sum('asset');
  const cf={inflow,payouts,salaries_net:net,outsource,services,opex,acquiring,ai:aiCost,taxes_paid:taxesPaid,operating:operatingCash,assets,investing:-assets,capital,loans,repay,dividends,financing:capital+loans-repay-dividends,total:operatingCash-assets+capital+loans-repay-dividends};
  out.push({month,pl,cf,taxes,paid});
 }
 return out;
}

// Owner and cleaner money held by the service at a month end (fact basis only): an owner's
// prepaid balance is a liability, a negative one is a receivable; reserved cleaning fees are
// owed to the cleaner; a cleaner's unpaid «Автопилот» fee is a receivable.
async function positions(db:D1Database,end:number){
 const owners=await rows(db,`SELECT o.owner_id,(COALESCE((SELECT SUM(amount) FROM owner_balance_entries WHERE owner_id=o.owner_id AND created_at<=?),0)
  -COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=o.owner_id AND c.mode='charged' AND c.created_at<=? AND ${live}),0)
  -COALESCE((SELECT SUM(amount) FROM cleaning_commissions WHERE owner_id=o.owner_id AND mode='charged' AND created_at<=?),0)
  -COALESCE((SELECT SUM(amount) FROM cleaning_holds WHERE owner_id=o.owner_id AND status IN ('held','due','paid') AND created_at<=?),0)
  -COALESCE((SELECT SUM(amount) FROM autopilot_charges WHERE user_id=o.owner_id AND role='owner' AND mode='charged' AND created_at<=?),0)) balance
  FROM (SELECT o.id owner_id FROM profiles o WHERE EXISTS(SELECT 1 FROM properties p WHERE p.owner_id=o.id AND p.demo_owner IS NULL)) o`,end,end,end,end,end);
 const holds=await one(db,"SELECT COALESCE(SUM(amount),0) n FROM cleaning_holds WHERE created_at<=? AND (status IN ('held','due') OR (status='paid' AND paid_at>?))",end,end);
 const cleaners=await one(db,"SELECT COALESCE((SELECT SUM(amount) FROM autopilot_charges WHERE role='cleaner' AND mode='charged' AND created_at<=?),0)-COALESCE((SELECT SUM(withheld) FROM autopilot_charges WHERE role='cleaner' AND mode='charged' AND COALESCE(settled_at,created_at)<=?),0) n",end,end);
 let advances=0,receivable=0;for(const o of owners){const v=Number(o.balance||0);if(v>0)advances+=v;else receivable-=v;}
 return {advances,receivable,cleanerPayable:Number(holds?.n||0),cleanerReceivable:Number(cleaners?.n||0)};
}

export function balanceAt(months:Month[],month:string,s:FinanceSettings,entries:Row[],pos:{advances:number;receivable:number;cleanerPayable:number;cleanerReceivable:number}){
 const upto=months.filter(m=>m.month<=month),add=(f:(m:Month)=>number)=>upto.reduce((a,m)=>a+f(m),0);
 const cash=add(m=>m.cf.total);
 const kind=(k:string)=>entries.filter(e=>e.month<=month&&e.kind===k).reduce((a,e)=>a+Number(e.amount),0);
 const accrued=add(m=>Object.values(m.taxes).reduce((a:number,v)=>a+Number(v),0) as number),paid=add(m=>m.cf.taxes_paid);
 const capital=(upto.some(m=>m.month===s.start_month)?s.share_capital:0)+kind('capital');
 const retained=add(m=>m.pl.net)-kind('dividend');
 const assets={cash,equipment:kind('asset'),owners:pos.receivable,cleaners:pos.cleanerReceivable};
 const liabilities={owners:pos.advances,cleaners:pos.cleanerPayable,taxes:accrued-paid,loans:kind('loan')-kind('loan_repay')};
 const equity={capital,retained};
 const totalAssets=Object.values(assets).reduce((a,b)=>a+b,0),totalLiabilities=Object.values(liabilities).reduce((a,b)=>a+b,0),totalEquity=capital+retained;
 return {month,assets,liabilities,equity,totalAssets,totalLiabilities,totalEquity,difference:totalAssets-totalLiabilities-totalEquity};
}

// The ceiling the business must watch: the income limit of the simplified declaration, or the
// turnover after which VAT registration is required on the general regime.
function limitInfo(s:FinanceSettings,yearRevenue:number){
 const simplified=s.tax_regime==='simplified',threshold=(simplified?SIMPLIFIED_LIMIT_MRP:s.vat_threshold_mrp)*s.mrp;
 return {kind:simplified?'simplified':'vat',threshold,yearRevenue,share:threshold?Math.min(1,yearRevenue/threshold):0,registered:!!s.vat_registered};
}
export async function companyFinance(db:D1Database,params:Row){
 const basis:Basis=params.basis==='forecast'?'forecast':'fact';
 const input=await inputs(db),now=monthKey(),s=input.settings;
 const first=[s.start_month,input.revenue.first||s.start_month].sort()[0];
 const last=shiftMonth(now,12);
 const month=monthRe.test(String(params.month||''))&&params.month>=first&&params.month<=last?String(params.month):now;
 const months=computeMonths(input,basis,last>month?last:month);
 const prev=shiftMonth(month,-1);
 const zero={advances:0,receivable:0,cleanerPayable:0,cleanerReceivable:0};
 const [pos,posPrev]=basis==='fact'?await Promise.all([positions(db,monthEnd(month)),positions(db,monthEnd(prev))]):[zero,zero];
 const year=month.slice(0,4),inYear=months.filter(m=>m.month.slice(0,4)===year);
 const ytd=(m:Month[])=>{const t:Row={pl:{},cf:{}};for(const x of m)for(const part of ['pl','cf'] as const)for(const [k,v] of Object.entries(x[part]))t[part][k]=(t[part][k]||0)+Number(v);return t;};
 const yearRows=inYear.filter(m=>m.month<=month),openingCash=months.filter(m=>m.month<inYear[0]?.month).reduce((a,m)=>a+m.cf.total,0);
 const yearRevenue=months.filter(m=>m.month.slice(0,4)===year&&m.month<=month).reduce((a,m)=>a+m.pl.gross-m.pl.vat,0);
 return {
  basis,month,now,first,last,settings:s,
  months:inYear,ytd:ytd(yearRows),openingCash,
  current:months.find(m=>m.month===month),
  balance:balanceAt(months,month,s,input.cashEntries,pos),
  previousBalance:prev>=first?balanceAt(months,prev,s,input.cashEntries,posPrev):null,
  costs:input.costs.map(c=>({...c,tenge:costTenge(c,s),inMonth:costInMonth(c,month,s),payroll:c.kind==='staff'&&c.employment==='employee'?payroll(costTenge(c,s),s):null})),
  cashEntries:input.cashEntries.slice(0,50),
  vat:limitInfo(s,yearRevenue),
 };
}

const bp=(value:unknown,label:string,max=3000)=>{const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<0||n*100>max)throw new DomainError(`«${label}»: от 0 до ${max/100}%`);return Math.round(n*100);};
export async function saveFinanceSettings(service:RentalService,body:Row){
 const version=number(body.expectedVersion,'Версия настроек',1,1e9);
 const start=String(body.startMonth||'');if(!monthRe.test(start))throw new DomainError('Укажите месяц начала учёта.');
 const regime=body.taxRegime==='simplified'?'simplified':'general',entity=body.entity==='too'?'too':'ip',name=required(body.companyName,'Название',80);
 const values=[entity,name,number(body.mzp,'МЗП',1,10000000),number(body.ownerBase,'База взносов ИП',0,100000000),bp(body.vosmsSelf,'ВОСМС ИП за себя'),start,regime,bp(body.cit,'КПН',5000),bp(body.simplified,'Упрощённая декларация',2000),body.vatRegistered?1:0,bp(body.vat,'НДС'),number(body.vatThresholdMrp,'Порог НДС в МРП',0,1000000),number(body.mrp,'МРП',1,100000),number(body.usdRate,'Курс доллара',1,100000),bp(body.opv,'ОПВ'),bp(body.vosmsEmployee,'ВОСМС работника'),bp(body.ipn,'ИПН'),number(body.ipnDeductionMrp,'Вычет по ИПН',0,1000),bp(body.sn,'Социальный налог'),bp(body.so,'Социальные отчисления'),bp(body.opvr,'ОПВР'),bp(body.vosmsEmployer,'ООСМС работодателя'),bp(body.acquiring,'Эквайринг'),number(body.shareCapital,'Уставный капитал',0,1e10)];
 const at=epoch(),r=await service.db.batch([
  q(service.db,"UPDATE company_finance_settings SET entity=?,company_name=?,mzp=?,owner_base=?,vosms_self_bp=?,start_month=?,tax_regime=?,cit_bp=?,simplified_bp=?,vat_registered=?,vat_bp=?,vat_threshold_mrp=?,mrp=?,usd_rate=?,opv_bp=?,vosms_employee_bp=?,ipn_bp=?,ipn_deduction_mrp=?,sn_bp=?,so_bp=?,opvr_bp=?,vosms_employer_bp=?,acquiring_bp=?,share_capital=?,version=version+1,updated_at=? WHERE id='global' AND version=?",...values,at,version),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),service.userId,'company-finance',JSON.stringify({action:'finance.settings_changed',previousVersion:version}),at),
 ]);
 if(!r[0].meta.changes)throw new DomainError('Настройки уже изменились. Обновите страницу.',409);
 return {message:'Допущения сохранены, отчёты пересчитаны.'};
}

export async function saveCost(service:RentalService,body:Row){
 const kind=['staff','service','opex'].includes(body.kind)?body.kind:null;if(!kind)throw new DomainError('Выберите вид расхода.');
 const name=required(body.name,'Название',120),currency=body.currency==='USD'?'USD':'KZT',period=['month','year','once'].includes(body.period)?body.period:'month';
 const employment=kind==='staff'?(body.employment==='outsource'?'outsource':'employee'):'none';
 const raw=Number(String(body.amount).replace(/\s/g,'').replace(',','.'));if(!Number.isFinite(raw)||raw<0||raw>1e8)throw new DomainError('Проверьте сумму.');
 const amount=currency==='USD'?Math.round(raw*100):Math.round(raw);
 const start=String(body.startMonth||'');if(!monthRe.test(start))throw new DomainError('Укажите месяц начала.');
 const end=body.endMonth?String(body.endMonth):null;if(end&&(!monthRe.test(end)||end<start))throw new DomainError('Месяц окончания должен быть не раньше начала.');
 const note=String(body.note||'').trim().slice(0,200),active=body.active===false?0:1,at=epoch();
 const id=body.id?required(body.id,'Расход',100):uuid();
 const r=body.id
  ?await q(service.db,'UPDATE company_costs SET kind=?,name=?,amount=?,currency=?,period=?,employment=?,start_month=?,end_month=?,active=?,note=?,updated_at=? WHERE id=?',kind,name,amount,currency,period,employment,start,end,active,note,at,id).run()
  :await q(service.db,'INSERT INTO company_costs(id,kind,name,amount,currency,period,employment,start_month,end_month,active,note,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+10 FROM company_costs WHERE kind=?),?,?)',id,kind,name,amount,currency,period,employment,start,end,active,note,kind,at,at).run();
 if(!r.meta.changes)throw new DomainError('Расход не найден. Обновите страницу.',404);
 await service.audit('company-finance',`finance.cost_${body.id?'updated':'added'}`).run();
 return {message:body.id?`«${name}» сохранено.`:`«${name}» добавлено.`};
}
export async function toggleCost(service:RentalService,body:Row){
 const id=required(body.id,'Расход',100);
 const r=await q(service.db,'UPDATE company_costs SET active=?,updated_at=? WHERE id=?',body.active?1:0,epoch(),id).run();
 if(!r.meta.changes)throw new DomainError('Расход не найден. Обновите страницу.',404);
 await service.audit('company-finance','finance.cost_'+(body.active?'on':'off')).run();
 return {message:body.active?'Расход включён в отчёты.':'Расход выключен и не попадает в отчёты.'};
}
export async function deleteCost(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите удаление.');
 const r=await q(service.db,'DELETE FROM company_costs WHERE id=?',required(body.id,'Расход',100)).run();
 if(!r.meta.changes)throw new DomainError('Расход уже удалён.',404);
 await service.audit('company-finance','finance.cost_deleted').run();return {message:'Расход удалён.'};
}
export const cashKinds:Record<string,string>={capital:'Взнос учредителя',loan:'Получен займ',loan_repay:'Возврат займа',dividend:'Дивиденды',asset:'Покупка техники'};
export async function addCashEntry(service:RentalService,body:Row){
 const kind=body.kind in cashKinds?body.kind:null;if(!kind)throw new DomainError('Выберите вид движения денег.');
 const month=String(body.month||'');if(!monthRe.test(month))throw new DomainError('Укажите месяц.');
 const amount=number(Math.round(Number(String(body.amount).replace(/\s/g,''))),'Сумма',1,1e10),note=String(body.note||'').trim().slice(0,200),at=epoch();
 await service.db.batch([q(service.db,'INSERT INTO company_cash_entries(id,kind,amount,month,note,created_at) VALUES (?,?,?,?,?,?)',uuid(),kind,amount,month,note,at),service.audit('company-finance','finance.cash_'+kind)]);
 return {message:`${cashKinds[kind]} записан.`};
}
export async function deleteCashEntry(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите удаление.');
 const r=await q(service.db,'DELETE FROM company_cash_entries WHERE id=?',required(body.id,'Запись',100)).run();
 if(!r.meta.changes)throw new DomainError('Запись уже удалена.',404);
 await service.audit('company-finance','finance.cash_deleted').run();return {message:'Запись удалена.'};
}

// Accounting: what the company owes the budget, by the period a declaration covers. Always the
// fact basis: a tax is owed on money that was really charged. Due dates follow the 2026 Tax Code
// for a small ТОО; the accountant marks a payment, which then appears in ДДС in its month.
const groupTaxes:Record<string,string[]>={self:[...selfTaxes],payroll:[...payrollTaxes],cit:['cit'],simplified:['simplified'],vat:['vat']};
const groupNames:Record<string,string>={self:'Взносы ИП за себя',payroll:'Налоги и взносы с зарплаты',cit:'КПН с прибыли',simplified:'Налог по упрощённой декларации',vat:'НДС'};
const dueDay=(y:number,m:number,d:number)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function periodOf(group:string,month:string){
 const [y,m]=month.split('-').map(Number);
 if(group==='payroll'||group==='self'){const n=shiftMonth(month,1).split('-').map(Number);return {period:month,due:dueDay(n[0],n[1],25),form:group==='self'?'Входит в декларацию 910.00':'Форма 200.00 раз в квартал'};}
 if(group==='cit')return {period:String(y),due:dueDay(y+1,4,10),form:'Декларация 100.00 до 31 марта'};
 if(group==='simplified')return m<=6?{period:`${y}-H1`,due:dueDay(y,8,25),form:'Декларация 910.00 до 15 августа'}:{period:`${y}-H2`,due:dueDay(y+1,2,25),form:'Декларация 910.00 до 15 февраля'};
 const quarter=Math.ceil(m/3),after=shiftMonth(`${y}-${String(quarter*3).padStart(2,'0')}`,2).split('-').map(Number);
 return {period:`${y}-Q${quarter}`,due:dueDay(after[0],after[1],25),form:'Декларация 300.00 раз в квартал'};
}
export async function accountingState(db:D1Database){
 const input=await inputs(db),now=monthKey(),today=new Date((epoch()+OFFSET)*1000).toISOString().slice(0,10);
 const months=computeMonths(input,'fact',now);
 // The journal shows the latest payments only; what is owed is reconciled against every payment.
 const [paidRows,paidTotals,paidYear]=await Promise.all([rows(db,'SELECT id,tax,period,amount,month,note,created_at FROM company_tax_payments ORDER BY created_at DESC,id LIMIT 200'),rows(db,'SELECT tax,period,COALESCE(SUM(amount),0) amount FROM company_tax_payments GROUP BY tax,period'),one(db,'SELECT COALESCE(SUM(amount),0) n FROM company_tax_payments WHERE month LIKE ?',now.slice(0,4)+'-%')]);
 const map=new Map<string,Row>();
 for(const m of months)for(const [group,taxes] of Object.entries(groupTaxes)){
  const amount=taxes.reduce((a,t)=>a+Number(m.taxes[t]||0),0);if(!amount)continue;
  const p=periodOf(group,m.month),key=group+':'+p.period,o=map.get(key)||{key,group,name:groupNames[group],period:p.period,due:p.due,form:p.form,accrued:0,parts:{} as Row,paid:0};
  o.accrued+=amount;for(const t of taxes)if(m.taxes[t])o.parts[t]=(o.parts[t]||0)+Number(m.taxes[t]);map.set(key,o);
 }
 for(const r of paidTotals){const group=Object.entries(groupTaxes).find(([,t])=>t.includes(r.tax))?.[0];const o=group&&map.get(group+':'+r.period);if(o)o.paid+=Number(r.amount);}
 const obligations=[...map.values()].map((o):Row=>{const left=o.accrued-o.paid;return {...o,left,status:left<=0?'paid':o.due<today?'overdue':'open'};}).sort((a,b)=>(a.status==='paid'?1:0)-(b.status==='paid'?1:0)||a.due.localeCompare(b.due));
 const open=obligations.filter(o=>o.status!=='paid');
 const s=input.settings,year=now.slice(0,4),yearRevenue=months.filter(m=>m.month.startsWith(year)).reduce((a,m)=>a+m.pl.revenue,0);
 const yearProfit=months.filter(m=>m.month.startsWith(year)).reduce((a,m)=>a+m.pl.operating,0);
 return {now,today,settings:s,obligations,payments:paidRows.map(r=>({...r,name:taxNames[r.tax]})),
  totals:{due:open.reduce((a,o)=>a+Math.max(0,o.left),0),overdue:open.filter(o=>o.status==='overdue').reduce((a,o)=>a+o.left,0),next:open.find(o=>o.status==='open')||null,paidYear:Number(paidYear?.n||0)},
  profit:{year,profit:yearProfit,cit:months.filter(m=>m.month.startsWith(year)).reduce((a,m)=>a+Number(m.taxes.cit||0)+Number(m.taxes.simplified||0),0)},
  vat:limitInfo(s,yearRevenue)};
}
// Paying an obligation records each tax in it: the whole remainder, or a part of a single tax.
export async function payTaxes(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите, что платёж отправлен в бюджет.');
 const state=await accountingState(service.db),o=state.obligations.find(x=>x.key===body.key);
 if(!o)throw new DomainError('Начисление не найдено. Обновите страницу.',404);
 if(o.left<=0)throw new DomainError('Это начисление уже оплачено.',409);
 const month=String(body.month||'');if(!monthRe.test(month))throw new DomainError('Укажите месяц оплаты.');
 const amount=number(Math.round(Number(String(body.amount).replace(/\s/g,''))),'Сумма',1,o.left);
 // Split the payment over the taxes in proportion to what is still owed on each.
 const paidBy:Row={};for(const r of await rows(service.db,'SELECT tax,COALESCE(SUM(amount),0) amount FROM company_tax_payments WHERE period=? GROUP BY tax',o.period))paidBy[r.tax]=Number(r.amount);
 const owed=Object.entries(o.parts as Row).map(([tax,v])=>[tax,Math.max(0,Number(v)-(paidBy[tax]||0))] as [string,number]).filter(([,v])=>v>0);
 const total=owed.reduce((a,[,v])=>a+v,0);let rest=amount;const at=epoch(),note=String(body.note||'').trim().slice(0,200);
 const statements=owed.map(([tax,v],i)=>{const share=i===owed.length-1?rest:Math.min(rest,Math.round(amount*v/total));rest-=share;return share>0?q(service.db,'INSERT INTO company_tax_payments(id,tax,period,amount,month,note,created_at) VALUES (?,?,?,?,?,?,?)',uuid(),tax,o.period,share,month,note,at):null;}).filter(Boolean) as D1PreparedStatement[];
 await service.db.batch([...statements,service.audit('company-finance','finance.tax_paid')]);
 return {message:`Оплата ${new Intl.NumberFormat('ru-RU').format(amount)} ₸ записана. Она уже в ДДС и уменьшила долг в балансе.`};
}
export async function deleteTaxPayment(service:RentalService,body:Row){
 if(body.confirmed!==true)throw new DomainError('Подтвердите удаление.');
 const r=await q(service.db,'DELETE FROM company_tax_payments WHERE id=?',required(body.id,'Платёж',100)).run();
 if(!r.meta.changes)throw new DomainError('Платёж уже удалён.',404);
 await service.audit('company-finance','finance.tax_payment_deleted').run();return {message:'Платёж удалён.'};
}
