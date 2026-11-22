import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {writePlatformAdmin}=await load('platform-admin');
const {monthKey}=await load('company-finance');
const {parseStatement}=await load('accounting-export');
const config=f=>({PLATFORM_ADMIN_IDS:f.other.userId});

// A month of money for the accountant: a stayed booking's commission, a manual payment and a cost payment.
async function month(f){
 const at=now(),m=monthKey(at);
 f.db.raw.prepare("UPDATE bookings SET status='completed',start=? WHERE id=?").run(at-7200,f.booking);
 f.db.raw.prepare("INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,created_at) SELECT ?,'owner',?,10000,400,400,'charged',? WHERE NOT EXISTS(SELECT 1 FROM platform_commissions WHERE booking_id=?)").run(f.booking,f.property,at,f.booking);
 f.db.raw.prepare("UPDATE platform_commissions SET mode='charged',amount=400 WHERE booking_id=?").run(f.booking);
 f.db.raw.prepare("UPDATE profiles SET name='=HYPERLINK(\"x\")' WHERE id='owner'").run();
 await writePlatformAdmin(f.other,'billing/balance',{confirmed:true,ownerId:'owner',kind:'topup',amount:5000,note:'Kaspi',requestKey:'k1',bankRef:'KP-500'},config(f));
 await writePlatformAdmin(f.other,'finance/cost',{kind:'service',name:'Хостинг',amount:'3000',period:'month',startMonth:m},config(f));
 const cost=f.db.raw.prepare("SELECT id FROM company_costs WHERE name='Хостинг'").get().id;
 await writePlatformAdmin(f.other,'finance/cost-payment',{costId:cost,month:m,amount:'3000',bankRef:'PP-77'},config(f));
 return m;
}

test('the month export for the accountant lists sales, money in and money out, safe to open in Excel',async()=>{
 const f=await fixture();try{
  const m=await month(f);
  await assert.rejects(writePlatformAdmin(f.owner,'accounting/export',{month:m},config(f)),e=>e.status===403);
  const r=await writePlatformAdmin(f.other,'accounting/export',{month:m},config(f));
  assert.ok(r.csv.startsWith('﻿Раздел;Дата;'));assert.equal(r.filename,`aiqonaq-${m}.csv`);
  assert.match(r.csv,/Выручка;[^\n]*Комиссия за заселение;"'=HYPERLINK\(""x""\)";/,'a name that looks like a formula is quoted and made text');
  assert.match(r.csv,/Поступление;[^\n]*;KP-500;5000/);assert.match(r.csv,/Платёж;[^\n]*Расход: Хостинг;;PP-77;-3000/);
  assert.ok(r.totals.sales>=400);assert.equal(r.totals.in,5000);assert.equal(r.totals.out,3000);
  await assert.rejects(writePlatformAdmin(f.other,'accounting/export',{month:'2026-13'},config(f)),/месяц/);
 }finally{f.db.close();}
});

test('the bank statement is matched by document number, then by amount and date; the rest is shown on each side',async()=>{
 const f=await fixture();try{
  const m=await month(f),d=new Date((now()+18000)*1000).toISOString().slice(0,10).split('-').reverse().join('.');
  const statement=`Выписка ТОО\nДата;Номер документа;Приход;Расход;Назначение\n${d};KP-500;5 000,00;;Оплата услуг\n${d};X1;;3000;Хостинг\n${d};Z9;12000;;Неизвестный перевод\n`;
  const r=await writePlatformAdmin(f.other,'accounting/reconcile',{month:m,statement},config(f));
  assert.equal(r.matched,2);assert.equal(r.bankOnly.length,1);assert.equal(r.bankOnly[0].amount,12000);assert.equal(r.serviceOnly.length,0);
  const empty=await writePlatformAdmin(f.other,'accounting/reconcile',{month:m,statement:'Дата;Сумма\n'+d+';100'},config(f));
  assert.equal(empty.matched,0);assert.equal(empty.serviceOnly.length,2);
  assert.throws(()=>parseStatement('просто текст'),/заголовков/);
  // A statement longer than the limit is refused, not cut: a cut file would hide bank lines.
  assert.throws(()=>parseStatement('Дата;Сумма\n'+Array.from({length:5001},()=>d+';1').join('\n')),/5000 строк/);
 }finally{f.db.close();}
});

test('a tax paid in one bank payment over several taxes is matched as one debit, with the bank date of the payment',async()=>{
 const f=await fixture();try{
  const m=monthKey(),first=m+'-02',bankDay=first.split('-').reverse().join('.');
  f.db.raw.prepare("INSERT INTO company_tax_payments(id,tax,period,amount,month,note,created_at,bank_ref,paid_on) VALUES ('t1','ipn',?,1000,?,'',?,'TAX-123',?),('t2','opv',?,2000,?,'',?,'TAX-123',?)").run(m,m,now(),first,m,m,now(),first);
  const csv=(await writePlatformAdmin(f.other,'accounting/export',{month:m},config(f))).csv;
  assert.match(csv,new RegExp('Платёж;'+first+';Налог ipn'),'the bank date, not the moment of entry');
  const r=await writePlatformAdmin(f.other,'accounting/reconcile',{month:m,statement:`Дата;Сумма;Номер\n${bankDay};-3000;TAX-123\n`},config(f));
  assert.equal(r.matched,1);assert.equal(r.bankOnly.length,0);assert.equal(r.serviceOnly.length,0);
 }finally{f.db.close();}
});
