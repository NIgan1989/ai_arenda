'use client';
import {useState} from 'react';
import {Landmark,CalendarClock,CheckCircle2,AlertTriangle,Percent,ArrowUpRight,Info,Receipt} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import {monthName} from './admin-finance';
import './admin-finance.css';
type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
const money=(value:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(value||0))+' ₸';
const date=(iso:string)=>new Date(iso+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','');
const partNames:Row={ipn:'ИПН',opv:'ОПВ',vosms_employee:'ВОСМС работника',sn:'Социальный налог',so:'Социальные отчисления',opvr:'ОПВР',vosms_employer:'ООСМС',cit:'КПН',simplified:'Налог 910.00',vat:'НДС'};
function periodText(o:Row){
 if(o.group==='payroll')return 'за '+monthName(o.period).toLowerCase();
 if(o.group==='cit')return 'за '+o.period+' год';
 if(o.group==='simplified')return (o.period.endsWith('H1')?'первое':'второе')+' полугодие '+o.period.slice(0,4);
 return o.period.slice(6)+' квартал '+o.period.slice(0,4);
}
const statusText:Row={paid:'Оплачено',open:'К оплате',overdue:'Просрочено'};

export function AdminAccounting({data,busy,save,onFinance}:{data:Row;busy:boolean;save:Save;onFinance:()=>void}){
 const [paying,setPaying]=useState<Row|null>(null),[showPaid,setShowPaid]=useState(false);
 const t=data.totals,open=(data.obligations as Row[]).filter(o=>o.status!=='paid'),paid=(data.obligations as Row[]).filter(o=>o.status==='paid');
 const regime=data.settings.tax_regime==='simplified';
 return <div className="admin-revenue admin-finance">
  <section className={'revenue-hero finance-hero '+(t.overdue>0?'is-loss':t.due>0?'is-scheduled':'is-active')}>
   <div className="revenue-hero-main">
    <span className="revenue-status"><i aria-hidden="true"/>{t.overdue>0?'Есть просрочка':t.due>0?'Есть платежи к сроку':'Долгов перед бюджетом нет'}</span>
    <p className="revenue-hero-label">К уплате в бюджет</p>
    <strong className="revenue-hero-value">{money(t.due)}</strong>
    <p className="revenue-hero-note">{t.overdue>0?`Из них просрочено ${money(t.overdue)}. Оплатите и отметьте платёж, чтобы пени не росли.`:t.next?`Ближайший срок ${date(t.next.due)}: ${t.next.name.toLowerCase()} ${periodText(t.next)}, ${money(t.next.left)}.`:'Все начисления оплачены. Новые появятся с зарплатой и прибылью следующего месяца.'}</p>
   </div>
   <div className="revenue-hero-side">
    <dl>
     <div><dt>Режим</dt><dd>{regime?'Упрощённая декларация':'Общий, КПН '+String(data.settings.cit_bp/100)+'%'}</dd></div>
     <div><dt>Прибыль за {data.profit.year} год</dt><dd className={data.profit.profit<0?'is-negative':''}>{data.profit.profit<0?'−':''}{money(Math.abs(data.profit.profit))}</dd></div>
     <div><dt>{regime?'Налог с дохода':'КПН начислен'}</dt><dd>{money(data.profit.cit)}</dd></div>
     <div><dt>Уплачено за год</dt><dd>{money(t.paidYear)}</dd></div>
    </dl>
    <Button className="revenue-primary" variant="outline" onClick={onFinance}><ArrowUpRight size={18}/>Открыть Финансиста</Button>
   </div>
  </section>

  <div className="revenue-stats" aria-label="Главные цифры">
   <Stat Icon={Landmark} label="Налог с прибыли" value={money(data.profit.cit)} note={data.profit.profit>0?'приходит из ОПИУ Финансиста':'прибыли пока нет, налог не начислен'}/>
   <Stat Icon={CalendarClock} label="Ближайший срок" value={t.next?date(t.next.due):'нет'} note={t.next?t.next.name:'всё оплачено'}/>
   <Stat Icon={Percent} label={data.vat.registered?'Плательщик НДС':'До порога НДС'} value={`${Math.round(data.vat.share*100)}%`} note={`${money(data.vat.yearRevenue)} из ${money(data.vat.threshold)}`}/>
  </div>

  <section className="admin-surface">
   <div className="admin-section-heading"><div><h2>Начисления и сроки</h2><p>Налоги считаются сами: с зарплат по «Расходам», с прибыли по ОПИУ. Оплаченное уходит в ДДС.</p></div><span className="admin-pill">{open.length} к оплате</span></div>
   {open.length===0?<div className="revenue-empty"><CheckCircle2 size={22}/><p>Неоплаченных налогов нет.</p></div>:<ul className="revenue-list">{open.map(o=><Obligation key={o.key} o={o} busy={busy} onPay={()=>setPaying(o)}/>)}</ul>}
   {paid.length>0&&<><button type="button" className="revenue-view finance-more" onClick={()=>setShowPaid(!showPaid)}>{showPaid?'Скрыть оплаченные':`Оплаченные: ${paid.length}`}</button>{showPaid&&<ul className="revenue-list">{paid.map(o=><Obligation key={o.key} o={o} busy={busy}/>)}</ul>}</>}
  </section>

  <section className="admin-surface">
   <div className="admin-section-heading"><div><h2>Журнал оплат</h2><p>Каждый платёж в бюджет, который вы отметили.</p></div><Receipt size={20}/></div>
   {data.payments.length===0?<p className="finance-empty">Платежей пока нет.</p>:<ul className="revenue-list">{data.payments.map((p:Row)=><li key={p.id}><div className="revenue-row"><span className="finance-dot"><CheckCircle2 size={16}/></span><span><strong>{p.name}</strong><small>период {p.period} · оплачено в {monthName(p.month,'long').toLowerCase()}{p.note?' · '+p.note:''}</small></span><b>{money(p.amount)}</b><Button variant="ghost" size="sm" disabled={busy} onClick={()=>save('accounting/payment/delete',{id:p.id,confirmed:true})}>Удалить</Button></div></li>)}</ul>}
  </section>

  <div className="finance-note"><Info size={18}/><p>Сроки по Налоговому кодексу РК 2026 года для небольшого ТОО: налоги с зарплаты до 25 числа следующего месяца, форма 200.00 раз в квартал, КПН по декларации 100.00 до 10 апреля следующего года{data.vat.registered?', НДС по декларации 300.00 до 25 числа второго месяца после квартала':''}. Авансовые платежи КПН не считаются. Сверьте с бухгалтером.</p></div>

  <Sheet open={!!paying} onOpenChange={v=>{if(!v)setPaying(null);}}><SheetContent side="right" className="revenue-sheet"><SheetHeader><SheetTitle>Отметить оплату</SheetTitle><SheetDescription>{paying?`${paying.name} ${periodText(paying)}. Срок ${date(paying.due)}.`:''}</SheetDescription></SheetHeader>{paying&&<PayForm o={paying} now={data.now} busy={busy} save={async b=>{const r=await save('accounting/pay',b);if(r)setPaying(null);}}/>}</SheetContent></Sheet>
 </div>;
}

function Stat({Icon,label,value,note}:{Icon:typeof Landmark;label:string;value:string;note:string}){return <section className="revenue-stat"><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></section>;}

function Obligation({o,busy,onPay}:{o:Row;busy:boolean;onPay?:()=>void}){
 const parts=Object.entries(o.parts as Row).map(([k,v])=>`${partNames[k]} ${new Intl.NumberFormat('ru-RU').format(Number(v))}`).join(' · ');
 return <li><div className="revenue-row finance-obligation">
  <span className={'finance-dot is-'+o.status}>{o.status==='overdue'?<AlertTriangle size={16}/>:o.status==='paid'?<CheckCircle2 size={16}/>:<CalendarClock size={16}/>}</span>
  <span><strong>{o.name} {periodText(o)}</strong><small>Срок {date(o.due)} · {o.form}</small><small>{parts}</small></span>
  <div className="finance-obligation-foot"><span className="finance-obligation-sum"><b>{money(o.status==='paid'?o.accrued:o.left)}</b><em className={'admin-pill '+(o.status==='overdue'?'warning':o.status==='paid'?'positive':'')}>{statusText[o.status]}</em>{o.paid>0&&o.status!=='paid'&&<small>оплачено {money(o.paid)}</small>}</span>
  {onPay&&<Button disabled={busy} onClick={onPay}>Отметить оплату</Button>}</div>
 </div></li>;
}

function PayForm({o,now,busy,save}:{o:Row;now:string;busy:boolean;save:(b:Row)=>Promise<void>}){
 const [amount,setAmount]=useState(String(o.left)),[month,setMonth]=useState(now),[note,setNote]=useState(''),[agreed,setAgreed]=useState(false);
 return <form className="revenue-terms" onSubmit={e=>{e.preventDefault();void save({key:o.key,amount,month,note,confirmed:agreed});}}>
  <div className="revenue-balance"><small>Осталось оплатить</small><strong>{money(o.left)}</strong><span>начислено {money(o.accrued)}{o.paid?`, оплачено ${money(o.paid)}`:''}</span></div>
  <div className="revenue-fields"><label>Сумма, ₸<Input value={amount} inputMode="numeric" required onChange={e=>setAmount(e.target.value.replace(/\D/g,'').slice(0,11))}/></label><label>Месяц оплаты<Input type="month" value={month} required onChange={e=>setMonth(e.target.value)}/></label></div>
  <label>Комментарий<Input value={note} maxLength={200} onChange={e=>setNote(e.target.value)} placeholder="Например: платёжка № 12 из Kaspi Business"/></label>
  <label className="revenue-confirm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/>Платёж отправлен в бюджет.</label>
  <Button className="revenue-primary" disabled={busy||!agreed}>Записать оплату</Button>
 </form>;
}
