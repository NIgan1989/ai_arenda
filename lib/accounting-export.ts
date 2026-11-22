import {DomainError} from './domain';
import {rows,type Row} from './operation-core';
import {stayedSql} from './stay-result';

// What the service hands the accountant of the ТОО (decision of 2026-11-22): the official books stay in the
// accountant's program (1С), the service gives clean data for a month and checks its money against the bank.
// · Sales: what the service earned in the month (accrual basis, ОУР): commissions by the month the stay began,
//   cleaning commissions, «Автопилот» and the selection fees.
// · Money: what really came to the account (card charges and manual payments) and what left it (taxes, costs).
const OFFSET=5*3600,monthRe=/^\d{4}-(0[1-9]|1[0-2])$/;
const bounds=(month:string)=>{const [y,m]=month.split('-').map(Number);return [Date.UTC(y,m-1,1)/1000-OFFSET,Date.UTC(y,m,1)/1000-OFFSET];};
const day=(at:number)=>new Date((at+OFFSET)*1000).toISOString().slice(0,10);
export function exportMonth(value:unknown){const month=String(value||'');if(!monthRe.test(month))throw new DomainError('Укажите месяц.');return month;}

export type BookLine={section:'sale'|'in'|'out';date:string;kind:string;party:string;doc:string;amount:number};
export async function monthBook(db:D1Database,month:string){
 const [from,to]=bounds(month),stayed=stayedSql('c.booking_id');
 const name="COALESCE((SELECT name FROM profiles WHERE id=%),'')";
 const [commissions,cleaning,autopilot,fees,incoming,taxes,costs]=await Promise.all([
  rows(db,`SELECT b.start at,c.amount,c.booking_id doc,${name.replace('%','c.owner_id')} party FROM platform_commissions c JOIN bookings b ON b.id=c.booking_id WHERE c.mode='charged' AND b.start>=? AND b.start<? AND ${stayed} ORDER BY b.start`,from,to),
  rows(db,`SELECT created_at at,amount,job_id doc,${name.replace('%','owner_id')} party FROM cleaning_commissions WHERE mode='charged' AND created_at>=? AND created_at<? ORDER BY created_at`,from,to),
  rows(db,`SELECT created_at at,amount,id doc,${name.replace('%','user_id')} party FROM autopilot_charges WHERE mode='charged' AND created_at>=? AND created_at<? ORDER BY created_at`,from,to),
  rows(db,`SELECT f.created_at at,f.amount,f.id doc,f.kind,${name.replace('%','f.user_id')} party FROM service_fees f WHERE f.mode='charged' AND f.created_at>=? AND f.created_at<? AND (f.kind<>'ai_booking' OR (SELECT status FROM bookings WHERE id=f.ref_id) IN ('confirmed','completed')) ORDER BY f.created_at`,from,to),
  rows(db,`SELECT e.created_at at,e.amount,COALESCE(NULLIF(e.bank_ref,''),(SELECT c.bank_ref FROM card_charges c WHERE c.request_key=e.request_key),'') doc,EXISTS(SELECT 1 FROM card_charges c WHERE c.request_key=e.request_key) card,${name.replace('%','e.owner_id')} party FROM owner_balance_entries e WHERE e.kind='topup' AND e.test=0 AND e.created_at>=? AND e.created_at<? ORDER BY e.created_at`,from,to),
  rows(db,'SELECT created_at at,paid_on,tax,period,amount,bank_ref doc FROM company_tax_payments WHERE month=? ORDER BY created_at',month),
  rows(db,'SELECT p.created_at at,p.paid_on,p.amount,p.bank_ref doc,c.name FROM company_cost_payments p JOIN company_costs c ON c.id=p.cost_id WHERE p.month=? ORDER BY p.created_at',month),
 ]);
 // A tax or a cost shows the bank date entered with it; an older entry without one shows the day it was entered
 // only when that day is in the month, otherwise no date rather than a wrong one.
 const dateOf=(r:Row)=>r.paid_on?String(r.paid_on):r.paid_on===''&&!day(Number(r.at)).startsWith(month)?'':day(Number(r.at));
 const line=(section:BookLine['section'],r:Row,kind:string,party='')=>({section,date:dateOf(r),kind,party:String(party||''),doc:String(r.doc||''),amount:Number(r.amount)});
 const lines:BookLine[]=[
  ...commissions.map(r=>line('sale',r,'Комиссия за заселение',r.party)),
  ...cleaning.map(r=>line('sale',r,'Комиссия с уборки',r.party)),
  ...autopilot.map(r=>line('sale',r,'Тариф «Автопилот»',r.party)),
  ...fees.map(r=>line('sale',r,r.kind==='ai_booking'?'Плата за подбор':'Услуга сервиса',r.party)),
  ...incoming.map(r=>line('in',r,r.card?'Списание с карты':'Оплата по счёту',r.party)),
  ...taxes.map(r=>line('out',r,'Налог '+r.tax+' за '+r.period)),
  ...costs.map(r=>line('out',r,'Расход: '+r.name)),
 ];
 const sum=(s:BookLine['section'])=>lines.filter(l=>l.section===s).reduce((a,l)=>a+l.amount,0);
 return {month,lines,totals:{sales:sum('sale'),in:sum('in'),out:sum('out')}};
}

// A file Excel and 1С open as it is: UTF-8 with a BOM, «;» between fields. A field that starts like a formula
// is prefixed with an apostrophe, so a name typed by a participant cannot run in the accountant's spreadsheet.
const SECTION:Record<BookLine['section'],string>={sale:'Выручка',in:'Поступление',out:'Платёж'};
const cell=(v:string|number)=>{let s=String(v);if(/^[=+\-@\t\r]/.test(s)&&typeof v==='string')s="'"+s;return /[";\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
export function bookCsv(book:Awaited<ReturnType<typeof monthBook>>){
 const head=['Раздел','Дата','Операция','Контрагент','Документ','Сумма, ₸'];
 const body=book.lines.map(l=>[SECTION[l.section],l.date,l.kind,l.party,l.doc,l.section==='out'?-l.amount:l.amount]);
 const totals=[['Итого выручка','','','','',book.totals.sales],['Итого поступило','','','','',book.totals.in],['Итого оплачено','','','','',-book.totals.out]];
 return '﻿'+[head,...body,[],...totals].map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
}
export async function accountingExport(db:D1Database,body:Row){
 const book=await monthBook(db,exportMonth(body.month));
 return {month:book.month,totals:book.totals,count:book.lines.length,filename:`aiqonaq-${book.month}.csv`,csv:bookCsv(book),message:`Выгрузка за ${book.month} готова: ${book.lines.length} строк.`};
}

// Сверка с выпиской: the administrator pastes the bank statement (CSV from Kaspi Pay or another bank). Nothing
// is stored: the service reads the date, the amount and the document number of each line and matches them with
// its own money of the month, first by the document number, then by the same amount within three days.
const norm=(s:string)=>s.toLowerCase().replace(/[^0-9a-zа-яё]/gi,'');
function amountOf(raw:string){const s=raw.replace(/[\s ₸]/g,'').replace(/,(\d{1,2})$/,'.$1').replace(/,/g,'');if(!/^[-+]?\d+(\.\d+)?$/.test(s))return null;return Math.round(Number(s));}
function dateOf(raw:string){let m=/^(\d{2})[.\/](\d{2})[.\/](\d{4})/.exec(raw.trim());if(m)return `${m[3]}-${m[2]}-${m[1]}`;m=/^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());return m?`${m[1]}-${m[2]}-${m[3]}`:null;}
function split(line:string,sep:string){const out:string[]=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(quoted){if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')quoted=false;else cur+=c;}else if(c==='"')quoted=true;else if(c===sep){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out.map(s=>s.trim());}
export type BankLine={date:string;amount:number;doc:string;text:string};
export function parseStatement(text:string):BankLine[]{
 if(typeof text!=='string'||!text.trim())throw new DomainError('Вставьте выписку из банка.');
 if(text.length>500000)throw new DomainError('Выписка слишком большая: загрузите один месяц.');
 const all=text.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());
 const sep=[';','\t',','].map(s=>[s,all.slice(0,5).reduce((a,l)=>a+l.split(s).length,0)] as [string,number]).sort((a,b)=>b[1]-a[1])[0][0];
 const at=all.findIndex(l=>/дата|date/i.test(l));if(at<0)throw new DomainError('Не нашёл строку заголовков: нужны столбцы «Дата», «Сумма» (или «Приход» и «Расход») и «Номер документа».');
 const head=split(all[at],sep).map(h=>h.toLowerCase()),find=(re:RegExp)=>head.findIndex(h=>re.test(h));
 const dateCol=find(/дата|date/),amountCol=find(/^сумма|amount|sum/),creditCol=find(/приход|кредит|зачисл|credit|поступ/),debitCol=find(/расход|дебет|списан|debit/),docCol=find(/номер|№|документ|reference|ref|id/),textCol=find(/назнач|описан|детал|purpose|description|комментар/);
 if(dateCol<0||(amountCol<0&&creditCol<0&&debitCol<0))throw new DomainError('Не нашёл столбцы «Дата» и «Сумма». Выгрузите выписку в CSV с заголовками.');
 const lines:BankLine[]=[];
 if(all.length-at-1>5000)throw new DomainError('В выписке больше 5000 строк: загрузите её по частям, за один месяц.');
 for(const raw of all.slice(at+1)){
  const c=split(raw,sep),date=dateOf(c[dateCol]||'');if(!date)continue;
  let amount:number|null=null;
  if(amountCol>=0)amount=amountOf(c[amountCol]||'');
  else{const cr=amountOf(c[creditCol]||'')||0,db=amountOf(c[debitCol]||'')||0;amount=cr-Math.abs(db);}
  if(!amount)continue;
  lines.push({date,amount,doc:docCol>=0?String(c[docCol]||''):'',text:textCol>=0?String(c[textCol]||'').slice(0,120):''});
 }
 if(!lines.length)throw new DomainError('В выписке нет строк с датой и суммой.');
 return lines;
}
const days=(a:string,b:string)=>Math.abs(Date.parse(a)-Date.parse(b))/86400000;
export async function reconcileStatement(db:D1Database,body:Row){
 const month=exportMonth(body.month),bank=parseStatement(body.statement).filter(l=>l.date.startsWith(month));
 const book=await monthBook(db,month);
 // One tax payment is split over its taxes (payTaxes), but the bank shows one debit: join the parts by bank document.
 const money:BookLine[]=[];
 for(const l of book.lines.filter(l=>l.section!=='sale')){const same=l.section==='out'&&l.kind.startsWith('Налог')&&l.doc?money.find(m=>m.section==='out'&&m.kind.startsWith('Налог')&&m.doc===l.doc):null;if(same){same.amount+=l.amount;same.kind='Налоги по документу';}else money.push({...l});}
 const ours=money.map(l=>({...l,signed:l.section==='in'?l.amount:-l.amount,used:false}));
 const matched:Row[]=[],bankOnly:Row[]=[];
 const pending=bank.map(b=>({b,hit:-1}));
 // By the document number first, then by the amount and a date within three days: the bank books a card charge a day or two later.
 for(const p of pending){const ref=norm(p.b.doc+' '+p.b.text);if(!ref)continue;const i=ours.findIndex(o=>!o.used&&o.signed===p.b.amount&&o.doc&&norm(o.doc).length>=3&&ref.includes(norm(o.doc)));if(i>=0){ours[i].used=true;p.hit=i;}}
 for(const p of pending){if(p.hit>=0)continue;const i=ours.findIndex(o=>!o.used&&o.signed===p.b.amount&&days(o.date,p.b.date)<=3);if(i>=0){ours[i].used=true;p.hit=i;}}
 for(const p of pending){if(p.hit>=0)matched.push({bank:p.b,service:ours[p.hit]});else bankOnly.push(p.b);}
 const serviceOnly=ours.filter(o=>!o.used).map(({used,...o})=>o);
 const message=!bankOnly.length&&!serviceOnly.length?`Сверка за ${month}: всё совпало, ${matched.length} операций.`:`Сверка за ${month}: совпало ${matched.length}, только в банке ${bankOnly.length}, только в сервисе ${serviceOnly.length}.`;
 return {month,matched:matched.length,bankOnly,serviceOnly,bankLines:bank.length,message};
}
