'use client';
import {useState,type FormEvent} from 'react';
import {Wallet,TrendingUp,CalendarClock,Bot,ChevronRight,Settings2,Search,Gift,PiggyBank,Info,Table2,BarChart3} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import './autopilot-plan.css';
type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
type Phase='off'|'scheduled'|'active';
const money=(value:number)=>new Intl.NumberFormat('ru-RU').format(value||0)+' ₸';
const short=(value:number)=>value>=1000000?(Math.round(value/100000)/10).toString().replace('.',',')+' млн ₸':value>=10000?Math.round(value/1000)+' тыс ₸':money(value);
const day=(at:number)=>new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long',year:'numeric'});
const isoDay=(at:number)=>new Date((at+5*3600)*1000).toISOString().slice(0,10);
const monthLabel=(value:string,style:'short'|'long')=>{const [y,m]=value.split('-').map(Number);return new Date(Date.UTC(y,m-1,15)).toLocaleDateString('ru-RU',style==='short'?{month:'short',timeZone:'UTC'}:{month:'long',year:'numeric',timeZone:'UTC'}).replace('.','');};
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
const kinds:Row={topup:'Пополнение',bonus:'Бонус',adjustment:'Корректировка'};
function feeFor(amount:number,rate:number,min:number,max:number){let fee=Math.floor((amount*Math.round(rate*100)+5000)/10000);if(max>0)fee=Math.min(fee,max);return Math.max(0,Math.min(Math.max(fee,min),amount));}
function lastMonths(now:number,count:number){const d=new Date((now+5*3600)*1000),out:string[]=[];for(let i=count-1;i>=0;i--){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-i,1));out.push(x.toISOString().slice(0,7));}return out;}

export function AdminRevenue({data,busy,save}:{data:Row;busy:boolean;save:Save}){
 const s=data.settings||{},phase=data.phase as Phase,m=data.last30||{};
 const [termsOpen,setTermsOpen]=useState(false),[tab,setTab]=useState<'owners'|'cleaners'|'plans'|'topups'|'history'>('owners');
 const headline=phase==='off'?m.projected:m.charged;
 const status=phase==='active'?{label:'Плата включена',note:`${percent(s.rate_bp)} с брони с ${day(s.starts_at)}`}:phase==='scheduled'?{label:'Плата запланирована',note:`${percent(s.rate_bp)} с брони начиная с ${day(s.starts_at)}`}:{label:'Бесплатный период',note:'Владельцы ничего не платят'};
 async function saveTerms(body:Row){const result=await save('billing/settings',body);if(result)setTermsOpen(false);return result;}
 return <div className="admin-revenue">
  <section className={'revenue-hero is-'+phase}>
   <div className="revenue-hero-main">
    <span className="revenue-status"><i aria-hidden="true"/>{status.label}</span>
    <p className="revenue-hero-label">{phase==='off'?'Могли бы заработать за 30 дней':'Начислено за 30 дней'}</p>
    <strong className="revenue-hero-value">{money(headline)}</strong>
    <p className="revenue-hero-note">{phase==='off'?`Это ${percent(s.rate_bp||500)} с ${m.bookings||0} броней на ${money(m.turnover)}. Включите плату, когда владельцы привыкнут к сервису.`:`Прогноз по всем броням: ${money(m.projected)}. ${status.note}`}</p>
   </div>
   <div className="revenue-hero-side">
    <dl>
     <div><dt>Комиссия</dt><dd>{percent(s.rate_bp||0)}</dd></div>
     <div><dt>В режиме «ИИ»</dt><dd>{percent(s.ai_rate_bp??1000)}</dd></div>
     <div><dt>Бесплатно каждому</dt><dd>{s.free_bookings||0} брон.</dd></div>
     <div><dt>Должников</dt><dd>{data.debtors||0}</dd></div>
    </dl>
    <Button className="revenue-primary" onClick={()=>setTermsOpen(true)} disabled={busy}><Settings2 size={18}/>{phase==='off'?'Включить плату':'Изменить условия'}</Button>
   </div>
  </section>

  <div className="revenue-stats" aria-label="Показатели за 30 дней">
   <Stat Icon={CalendarClock} label="Брони за 30 дней" value={String(m.bookings||0)} note={`всего ${data.allTime?.bookings||0}`}/>
   <Stat Icon={TrendingUp} label="Оборот владельцев" value={short(m.turnover)} note="сумма этих броней"/>
   <Stat Icon={Bot} label="Расходы на ИИ" value={'$'+(data.aiCostUsd30||0)} note={`${data.aiRequests30||0} запросов`}/>
  </div>

  <MonthlyChart rows={data.monthly||[]} now={data.serverTime} phase={phase}/>

  <section className="admin-surface revenue-ledger">
   <div className="revenue-tabs" role="tablist" aria-label="Деньги владельцев">
    {([['owners','Владельцы'],['cleaners','Исполнителям'],['plans','Тарифы'],['topups','Пополнения'],['history','Журнал условий']] as const).map(([id,label])=><button key={id} role="tab" type="button" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}{id==='owners'&&data.debtors>0&&<b>{data.debtors}</b>}{id==='cleaners'&&data.cleaners?.due?.length>0&&<b>{data.cleaners.due.length}</b>}</button>)}
   </div>
   {tab==='plans'&&<AutopilotPlans data={data.plans||{}} busy={busy} save={save}/>}
   {tab==='cleaners'&&<CleanerPayouts data={data.cleaners||{}} busy={busy} save={save}/>}
   {tab==='owners'&&<OwnerBalances data={data} busy={busy} save={save} phase={phase}/>}
   {tab==='topups'&&(data.topups?.length?<ul className="revenue-list">{data.topups.map((t:Row)=><li key={t.id}><div className="revenue-row"><span className={'revenue-icon kind-'+t.kind}>{t.kind==='bonus'?<Gift size={18}/>:<PiggyBank size={18}/>}</span><span><strong>{t.owner_name||'Владелец'}</strong><small>{kinds[t.kind]} · {day(t.created_at)} · {t.note}</small></span><b className={t.amount<0?'is-negative':'is-positive'}>{t.amount>0?'+':''}{money(t.amount)}</b></div></li>)}</ul>:<Empty Icon={PiggyBank} text="Пополнений пока нет. Отмечайте их в карточке владельца, когда деньги придут на Kaspi."/>)}
   {tab==='history'&&(data.history?.length?<ol className="revenue-timeline">{data.history.map((h:Row,i:number)=><li key={i}><strong>{h.enabled?`Комиссия ${String(h.ratePercent).replace('.',',')}% с ${day(h.startsAt)}`:'Плата выключена'}</strong><small>{day(h.at)}{h.enabled?` · бесплатно ${h.freeBookings} брон.${h.minFee?` · минимум ${money(h.minFee)}`:''}${h.maxFee?` · максимум ${money(h.maxFee)}`:''}`:''}</small></li>)}</ol>:<Empty Icon={Info} text="Условия ещё не менялись. Сейчас действует бесплатный период."/>)}
  </section>

  <Sheet open={termsOpen} onOpenChange={setTermsOpen}><SheetContent side="right" className="revenue-sheet"><SheetHeader><SheetTitle>Условия оплаты</SheetTitle><SheetDescription>Комиссия с владельца за каждую бронь, подтверждённую через приложение.</SheetDescription></SheetHeader>{termsOpen&&<BillingTerms settings={s} now={data.serverTime} phase={phase} busy={busy} save={saveTerms}/>}</SheetContent></Sheet>
 </div>;
}

function Stat({Icon,label,value,note}:{Icon:typeof Wallet;label:string;value:string;note:string}){return <section className="revenue-stat"><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></section>;}
function Empty({Icon,text}:{Icon:typeof Wallet;text:string}){return <div className="revenue-empty"><Icon size={22}/><p>{text}</p></div>;}

function MonthlyChart({rows,now,phase}:{rows:Row[];now:number;phase:Phase}){
 const [table,setTable]=useState(false),[hover,setHover]=useState<string|null>(null);
 const byMonth=new Map(rows.map(r=>[r.month,r])),months:Row[]=lastMonths(now,6).map(month=>({bookings:0,turnover:0,projected:0,charged:0,...byMonth.get(month),month}));
 const top=Math.max(1,...months.map(r=>r.projected||0)),charged=phase!=='off'||months.some(r=>r.charged>0),active=months.find(r=>r.month===hover);
 return <section className="admin-surface revenue-chart">
  <div className="admin-section-heading"><div><h2>Доход по месяцам</h2><p>{charged?'Прогноз и фактически начисленная комиссия':'Сколько принесла бы комиссия'}</p></div><button type="button" className="revenue-view" onClick={()=>setTable(!table)} aria-pressed={table}>{table?<><BarChart3 size={16}/>График</>:<><Table2 size={16}/>Таблица</>}</button></div>
  {charged&&!table&&<div className="revenue-legend"><span><i className="is-forecast"/>Прогноз</span><span><i className="is-charged"/>Начислено</span></div>}
  {table?<div className="revenue-table-wrap"><table className="admin-revenue-table"><thead><tr><th>Месяц</th><th>Брони</th><th>Оборот</th><th>Прогноз</th><th>Начислено</th></tr></thead><tbody>{months.slice().reverse().map(r=><tr key={r.month}><td>{monthLabel(r.month,'long')}</td><td>{r.bookings}</td><td>{money(r.turnover)}</td><td>{money(r.projected)}</td><td>{money(r.charged)}</td></tr>)}</tbody></table></div>:
  <div className="revenue-bars" onMouseLeave={()=>setHover(null)}>
   {months.map(r=><button type="button" key={r.month} className={'revenue-bar-slot'+(hover===r.month?' is-active':'')} aria-label={`${monthLabel(r.month,'long')}: прогноз ${money(r.projected)}, начислено ${money(r.charged)}, броней ${r.bookings}`} onMouseEnter={()=>setHover(r.month)} onFocus={()=>setHover(r.month)} onBlur={()=>setHover(null)}>
    <span className="revenue-bar-pair">
     <i className="is-forecast" style={{height:`${Math.max(r.projected?2:0,(r.projected/top)*100)}%`}}/>
     {charged&&<i className="is-charged" style={{height:`${Math.max(r.charged?2:0,(r.charged/top)*100)}%`}}/>}
    </span>
    <small>{monthLabel(r.month,'short')}</small>
   </button>)}
   {active&&<div className="revenue-tooltip" role="status"><strong>{monthLabel(active.month,'long')}</strong><span>Броней: {active.bookings}</span><span>Оборот: {money(active.turnover)}</span><span>Прогноз: {money(active.projected)}</span>{charged&&<span>Начислено: {money(active.charged)}</span>}</div>}
  </div>}
 </section>;
}

function BillingTerms({settings:s,now,phase,busy,save}:{settings:Row;now:number;phase:Phase;busy:boolean;save:(body:Row)=>Promise<Row|undefined>}){
 const [enabled,setEnabled]=useState(!!s.enabled),[rate,setRate]=useState(String((s.rate_bp??500)/100)),[aiRate,setAiRate]=useState(String((s.ai_rate_bp??1000)/100)),[minFee,setMinFee]=useState(String(s.min_fee||0)),[maxFee,setMaxFee]=useState(String(s.max_fee||0)),[free,setFree]=useState(String(s.free_bookings??3)),[cleanRate,setCleanRate]=useState(String((s.cleaning_rate_bp??1000)/100)),[pairRate,setPairRate]=useState(String((s.pair_rate_bp??500)/100)),[pairCap,setPairCap]=useState(String(s.pair_month_cap??2000)),[start,setStart]=useState(isoDay(s.enabled?s.starts_at:now+30*86400)),[agreed,setAgreed]=useState(false);
 const cr=Number(cleanRate)||0,pr=Number(pairRate)||0,cap=Number(pairCap)||0,r=Number(rate)||0,ai=Number(aiRate)||0,min=Number(minFee)||0,max=Number(maxFee)||0;
 const soon=enabled&&phase!=='active'&&Date.parse(start+'T00:00:00+05:00')/1000<now+14*86400;
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const chosen=Math.floor(Date.parse(start+'T00:00:00+05:00')/1000);
  // Keep a running start date untouched unless the administrator picked another day.
  const startsAt=s.enabled&&s.starts_at<=now&&start===isoDay(s.starts_at)?s.starts_at:Math.max(chosen,Math.floor(Date.now()/1000));
  await save({enabled,ratePercent:r,aiRatePercent:ai,minFee:min,maxFee:max,freeBookings:Number(free)||0,cleaningRatePercent:cr,pairRatePercent:pr,pairMonthCap:cap,startsAt,expectedVersion:s.version,confirmed:agreed});
 }
 return <form className="revenue-terms" onSubmit={submit}>
  <label className="revenue-switch"><input type="checkbox" role="switch" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span className="revenue-switch-track" aria-hidden="true"/><span><strong>Брать комиссию с владельцев</strong><small>{enabled?'Плата спишется с баланса владельца при подтверждении брони.':'Сейчас сервис бесплатный. Прогноз дохода всё равно считается.'}</small></span></label>
  <fieldset disabled={!enabled}>
   <legend>Сколько платит владелец</legend>
   <div className="revenue-fields">
    <label>Комиссия, %<Input type="number" inputMode="decimal" min={0} max={30} step={0.1} value={rate} onChange={e=>setRate(e.target.value)} required/></label>
    <label>В режиме «ИИ», %<Input type="number" inputMode="decimal" min={0} max={30} step={0.1} value={aiRate} onChange={e=>setAiRate(e.target.value)} required/></label>
    <label>Бесплатных броней<Input type="number" inputMode="numeric" min={0} max={1000} value={free} onChange={e=>setFree(e.target.value)}/></label>
    <label>Минимум, ₸<Input type="number" inputMode="numeric" min={0} value={minFee} onChange={e=>setMinFee(e.target.value)}/></label>
    <label>Максимум, ₸<Input type="number" inputMode="numeric" min={0} value={maxFee} onChange={e=>setMaxFee(e.target.value)} placeholder="Без ограничения"/></label>
   </div>
   <p className="revenue-sublegend">Уборки</p>
   <div className="revenue-fields">
    <label>За уборку, %<Input type="number" inputMode="decimal" min={0} max={30} step={0.1} value={cleanRate} onChange={e=>setCleanRate(e.target.value)} required/></label>
    <label>Постоянной паре, %<Input type="number" inputMode="decimal" min={0} max={30} step={0.1} value={pairRate} onChange={e=>setPairRate(e.target.value)} required/></label>
    <label>Паре не больше в месяц, ₸<Input type="number" inputMode="numeric" min={0} value={pairCap} onChange={e=>setPairCap(e.target.value)} placeholder="Без ограничения"/></label>
   </div>
   <label>Начать с<Input type="date" min={phase==='active'?undefined:isoDay(now)} value={start} onChange={e=>setStart(e.target.value)} required={enabled}/></label>
  </fieldset>
  <div className="revenue-example"><small>Пример расчёта</small><div><span>Бронь на сутки, 15 000 ₸</span><b>{money(feeFor(15000,r,min,max))}</b></div><div><span>Почасовая бронь, 4 000 ₸</span><b>{money(feeFor(4000,r,min,max))}</b></div><div><span>Сутки, 15 000 ₸, режим «ИИ»</span><b>{money(feeFor(15000,ai,min,max))}</b></div><div><span>Уборка 8 000 ₸ / у постоянной пары</span><b>{money(feeFor(8000,cr,0,0))} / {money(Math.min(feeFor(8000,pr,0,0),cap||Infinity))}</b></div></div>
  {enabled&&<p className={'revenue-callout'+(soon?' is-warning':'')}><Info size={16}/>{soon?'До начала меньше двух недель. Лучше дать владельцам месяц, чтобы они успели пополнить баланс.':'Владельцы получат уведомление в приложении. Отменённые брони никогда не оплачиваются.'}</p>}
  <label className="revenue-confirm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/>{enabled?'Я понимаю, что владельцы будут платить по этим условиям.':'Оставить сервис бесплатным.'}</label>
  <Button className="revenue-primary" disabled={busy||!agreed}>Сохранить условия</Button>
 </form>;
}

function OwnerBalances({data,busy,save,phase}:{data:Row;busy:boolean;save:Save;phase:Phase}){
 const [query,setQuery]=useState(''),[result,setResult]=useState<Row|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<Row|null>(null);
 const view=result||{owners:data.owners||[],total:data.ownersTotal||0,page:0,limit:data.ownersLimit||25,search:''};
 async function load(search:string,page:number){
  setLoading(true);setError('');
  try{const r=await fetch('/api/admin/billing/owners?'+new URLSearchParams({search,page:String(page)}),{cache:'no-store'});const value=await r.json() as Row;if(!r.ok)throw Error(value.error||'Не удалось загрузить владельцев.');setResult({...value,search,owners:page?[...view.owners,...value.owners]:value.owners});}
  catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить владельцев.');}finally{setLoading(false);}
 }
 // A saved operation refreshes the whole section; drop the local list so balances are current.
 const [seen,setSeen]=useState(data);if(seen!==data){setSeen(data);setResult(null);setQuery('');setSelected(null);}
 return <>
  <form className="revenue-search" role="search" onSubmit={e=>{e.preventDefault();void load(query.trim(),0);}}><span className="revenue-search-field"><Search size={18} aria-hidden="true"/><Input value={query} onChange={e=>setQuery(e.target.value)} maxLength={100} placeholder="Найти владельца по имени" aria-label="Найти владельца"/></span><Button variant="outline" disabled={loading}>Найти</Button></form>
  {error&&<p className="admin-muted" role="alert">{error}</p>}
  {view.owners.length?<ul className="revenue-list">{view.owners.map((o:Row)=><li key={o.id}><button type="button" className="revenue-row" onClick={()=>setSelected(o)}><span className="revenue-avatar" aria-hidden="true">{String(o.name).replace(/^ТЕСТ · /,'').slice(0,1).toUpperCase()}</span><span><strong>{o.name}</strong><small>Объектов {o.properties} · броней {o.bookings}{phase!=='off'?` · бесплатных ${o.freeLeft}`:''}</small></span><b className={o.balance<0?'is-negative':o.balance>0?'is-positive':''}>{money(o.balance)}</b><ChevronRight size={18} aria-hidden="true"/></button></li>)}</ul>:<Empty Icon={Search} text={view.search?'Никого не нашли. Проверьте имя.':'Владельцев с объектами пока нет.'}/>}
  {view.owners.length<view.total&&<Button variant="outline" className="revenue-more" disabled={loading} onClick={()=>load(view.search||'',Math.ceil(view.owners.length/view.limit))}>{loading?'Загружаю…':`Показать ещё · всего ${view.total}`}</Button>}
  <Sheet open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><SheetContent side="right" className="revenue-sheet">{selected&&<OwnerCard owner={selected} busy={busy} save={save}/>}</SheetContent></Sheet>
 </>;
}

function OwnerCard({owner:o,busy,save}:{owner:Row;busy:boolean;save:Save}){
 const [kind,setKind]=useState('topup'),[key]=useState(()=>crypto.randomUUID());
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);await save('billing/balance',{ownerId:o.id,kind,amount:Number(form.get('amount')),note:String(form.get('note')||''),requestKey:key,confirmed:form.get('confirmed')==='on'});}
 return <>
  <SheetHeader><SheetTitle>{o.name}</SheetTitle><SheetDescription>Объектов {o.properties} · броней через сервис {o.bookings}</SheetDescription></SheetHeader>
  <div className="revenue-sheet-body">
   <div className={'revenue-balance'+(o.balance<0?' is-negative':'')}><small>Баланс</small><strong>{money(o.balance)}</strong><span>{o.balance<0?'Владелец должен сервису. Попросите пополнить баланс.':'Долга нет.'}</span></div>
   <dl className="revenue-facts"><div><dt>Пополнено и бонусы</dt><dd>{money(o.credited)}</dd></div><div><dt>Начислено комиссии</dt><dd>{money(o.charged)}</dd></div><div><dt>Прогноз по всем броням</dt><dd>{money(o.projected)}</dd></div><div><dt>Осталось бесплатных броней</dt><dd>{o.freeLeft}</dd></div></dl>
   <form className="revenue-terms" onSubmit={submit}>
    <h3>Записать операцию</h3>
    <div className="revenue-segment" role="radiogroup" aria-label="Вид операции">{(['topup','bonus','adjustment'] as const).map(k=><button key={k} type="button" role="radio" aria-checked={kind===k} onClick={()=>setKind(k)}>{kinds[k]}</button>)}</div>
    <label>Сумма, ₸<Input name="amount" type="number" inputMode="numeric" min={kind==='adjustment'?-10000000:1} max={10000000} required/></label>
    <label>Комментарий<Input name="note" maxLength={300} required placeholder={kind==='topup'?'Например: перевод Kaspi от 12 ноября':kind==='bonus'?'Например: подарок за первые брони':'Причина, сумма может быть с минусом'}/></label>
    <label className="revenue-confirm"><input name="confirmed" type="checkbox" required/>{kind==='topup'?'Деньги пришли мне на счёт.':'Я согласовал эту операцию.'}</label>
    <Button className="revenue-primary" disabled={busy}>Записать</Button>
   </form>
  </div>
 </>;
}

// Money the service holds for cleaners: reserves due after the owner accepted the work. Until bank payouts
// exist the administrator sends it by Kaspi and marks it here; the cleaner and the owner are told at once.
function CleanerPayouts({data:c,busy,save}:{data:Row;busy:boolean;save:Save}){
 const [open,setOpen]=useState<Row|null>(null),[agreed,setAgreed]=useState(false);
 const k=c.commissions30||{};
 return <>
  <dl className="revenue-facts revenue-cleaners-facts"><div><dt>Постоянных пар</dt><dd>{c.pairs||0}</dd></div><div><dt>Зарезервировано</dt><dd>{money(c.held)}</dd></div><div><dt>К выплате</dt><dd>{money(c.dueTotal)}</dd></div><div><dt>Выплачено за 30 дней</dt><dd>{money(c.paid30)}</dd></div><div><dt>Комиссия с уборок, 30 дней</dt><dd>{money(k.amount)}{k.count?` · ${k.count} убор., пар ${k.pairs}`:''}</dd></div></dl>
  {c.due?.length?<ul className="revenue-list">{c.due.map((d:Row)=><li key={d.job_id}><button type="button" className="revenue-row" onClick={()=>{setOpen(d);setAgreed(false);}}><span className="revenue-avatar" aria-hidden="true">{String(d.cleaner_name||'?').slice(0,1)}</span><span><strong>{d.cleaner_name}</strong><small>{d.title} · {d.owner_name} · принято {day(d.due_at)}</small></span><b className="is-positive">{money(d.amount)}</b><ChevronRight size={18} aria-hidden="true"/></button></li>)}</ul>
   :<Empty Icon={Wallet} text="Выплачивать сейчас некому. Здесь появятся уборки, принятые владельцем, если их оплата была зарезервирована."/>}
  <Sheet open={!!open} onOpenChange={v=>{if(!v)setOpen(null);}}><SheetContent side="right" className="revenue-sheet">{open&&<>
   <SheetHeader><SheetTitle>Выплата {open.cleaner_name}</SheetTitle><SheetDescription>{open.title} · владелец {open.owner_name}</SheetDescription></SheetHeader>
   <div className="revenue-sheet-body">
    <div className="revenue-balance"><small>Отправить</small><strong>{money(open.amount-(open.withhold||0))}</strong><span>{open.withhold?'Из '+money(open.amount)+' удержано '+money(open.withhold)+' за автопилот исполнителя. ':''}{open.cleaner_contact?'Контакт: '+open.cleaner_contact:'Контакт в профиле исполнителя'}</span></div>
    <form className="revenue-terms" onSubmit={async e=>{e.preventDefault();const r=await save('billing/payout',{jobId:open.job_id,confirmed:agreed,note:String(new FormData(e.currentTarget).get('note')||'')});if(r)setOpen(null);}}>
     <label>Комментарий<Input name="note" maxLength={300} placeholder="Например: перевод Kaspi, 13 ноября"/></label>
     <label className="revenue-confirm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/>Деньги отправлены исполнителю.</label>
     <Button className="revenue-primary" disabled={busy||!agreed}>Отметить выплату</Button>
    </form>
   </div>
  </>}</SheetContent></Sheet>
 </>;
}

// Тарифы: the «Автопилот» plan for owners and cleaners. Charging stays off until bank top-ups work; until then
// every plan runs free and the service records what it would have taken.
function AutopilotPlans({data,busy,save}:{data:Row;busy:boolean;save:Save}){
 const s=data.settings||{},o=data.owner||{},c=data.cleaner||{};
 const [form,setForm]=useState(()=>({ownerPrice:String(s.ownerPrice??4900),cleanerPrice:String(s.cleanerPrice??1900),trialDays:String(s.trialDays??14),graceDays:String(s.graceDays??3)})),[agreed,setAgreed]=useState(false);
 const field=(key:keyof typeof form,label:string,suffix:string)=><label className="plans-field">{label}<span><Input inputMode="numeric" value={form[key]} disabled={busy} onChange={e=>setForm({...form,[key]:e.target.value.replace(/\D/g,'').slice(0,7)})}/><em>{suffix}</em></span></label>;
 const submit=(charge:boolean)=>save('billing/plans',{charge,confirmed:true,ownerPrice:Number(form.ownerPrice||0),cleanerPrice:Number(form.cleanerPrice||0),trialDays:Number(form.trialDays||0),graceDays:Number(form.graceDays||0)}).then(r=>{if(r)setAgreed(false);});
 const stat=(n:number,label:string)=><div><dt>{label}</dt><dd>{n}</dd></div>;
 return <div className="plans">
  <div className={'plans-charge'+(s.charge?' is-on':'')}><div><strong>{s.charge?'Плата за автопилот включена.':'Плата за автопилот выключена.'}</strong><p>{s.charge?'Владельцы платят с баланса, исполнители из выплат. Не хватило денег: отсрочка, потом пауза.':'Все, кто подключил, пользуются бесплатно. Сервис считает, сколько заработал бы. Включите, когда заработает пополнение через банк.'}</p></div>
   {s.charge?<Button variant="outline" disabled={busy} onClick={()=>submit(false)}>Выключить плату</Button>:<label className="plans-agree"><input type="checkbox" checked={agreed} disabled={busy} onChange={e=>setAgreed(e.target.checked)}/>Участники получат уведомление</label>}
   {!s.charge&&<Button disabled={busy||!agreed} onClick={()=>submit(true)}>Включить плату</Button>}</div>
  <div className="plans-cols">
   <section className="plans-card"><h3>Автопилот владельца</h3><p>Цена за одну квартиру под ИИ в месяц. Комиссия с брони у таких квартир обычная, без надбавки за ИИ.</p>
    <dl className="revenue-facts">{stat(o.trial||0,'В пробном')}{stat(o.active||0,'Платят')}{stat(o.grace||0,'Отсрочка')}{stat(o.paused||0,'На паузе')}{stat(o.flats||0,'Квартир под ИИ')}</dl>
    <p className="plans-sum">{s.charge?'Списано за 30 дней: '+money(o.charged30):'Было бы за месяц: '+money(o.monthly)}</p></section>
   <section className="plans-card"><h3>Автопилот исполнителя</h3><p>Цена в месяц. Удерживается из ближайшей выплаты за уборки.</p>
    <dl className="revenue-facts">{stat(c.trial||0,'В пробном')}{stat(c.active||0,'Платят')}{stat(c.grace||0,'Отсрочка')}{stat(c.paused||0,'На паузе')}{stat(c.taken30||0,'Уборок взял ИИ за 30 дней')}</dl>
    <p className="plans-sum">{s.charge?'Удержано за 30 дней: '+money(c.charged30):'Было бы за 30 дней: '+money(c.shadow30)}</p></section>
  </div>
  <section className="plans-card"><h3>Условия</h3>
   <div className="plans-fields">{field('ownerPrice','Владелец, за квартиру','₸ в месяц')}{field('cleanerPrice','Исполнитель','₸ в месяц')}{field('trialDays','Бесплатно','дней')}{field('graceDays','Отсрочка','дней')}</div>
   <Button disabled={busy} onClick={()=>submit(!!s.charge)}>Сохранить условия</Button></section>
 </div>;
}
