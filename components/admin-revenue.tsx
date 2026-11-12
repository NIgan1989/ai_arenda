'use client';
import {useState,type FormEvent} from 'react';
import {Wallet,TrendingUp,CalendarClock,CircleDollarSign,ChevronRight,History} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
const money=(value:number)=>new Intl.NumberFormat('ru-RU').format(value||0)+' ₸';
const day=(at:number)=>new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long',year:'numeric'});
const isoDay=(at:number)=>new Date((at+5*3600)*1000).toISOString().slice(0,10);
const monthName=(value:string)=>{const [y,m]=value.split('-').map(Number);return new Date(Date.UTC(y,m-1,15)).toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});};
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
const kinds:Row={topup:'Пополнение',bonus:'Бонус',adjustment:'Корректировка'};
function feeFor(amount:number,rate:number,min:number,max:number){let fee=Math.floor((amount*Math.round(rate*100)+5000)/10000);if(max>0)fee=Math.min(fee,max);return Math.max(0,Math.min(Math.max(fee,min),amount));}

export function AdminRevenue({data,busy,save}:{data:Row;busy:boolean;save:Save}){
 const s=data.settings||{},phase=data.phase as 'off'|'scheduled'|'active';
 const banner=phase==='active'?{title:'Плата включена',note:`Комиссия ${percent(s.rate_bp)} списывается с баланса владельца при подтверждении брони. Действует с ${day(s.starts_at)}`}:phase==='scheduled'?{title:`Плата начнётся ${day(s.starts_at)}`,note:`До этой даты брони остаются бесплатными. Владельцы получили уведомление о комиссии ${percent(s.rate_bp)}.`}:{title:'Плата выключена',note:'Сервис бесплатен для всех. Каждая подтверждённая бронь сохраняется в прогнозе, чтобы вы видели будущий доход.'};
 const m=data.last30||{};
 return <div className="admin-revenue">
  <section className={'admin-service-banner '+(phase==='off'?'is-healthy':'needs-attention')}><span className="admin-service-icon"><Wallet size={24}/></span><div><h2>{banner.title}</h2><p>{banner.note}</p></div></section>
  <div className="admin-metrics" aria-label="Доход за 30 дней">{[
   {label:'Брони за 30 дней',value:String(m.bookings||0),Icon:CalendarClock,note:'подтверждены в сервисе'},
   {label:'Оборот владельцев',value:money(m.turnover),Icon:TrendingUp,note:'сумма этих броней'},
   {label:phase==='off'?'Могли бы заработать':'Прогноз дохода',value:money(m.projected),Icon:CircleDollarSign,note:phase==='off'?'по условиям в прогнозе':'включая бесплатные брони'},
   {label:'Начислено',value:money(m.charged),Icon:Wallet,note:`расходы на ИИ: $${data.aiCostUsd30||0}`},
  ].map(({label,value,Icon,note})=><section className="admin-metric" key={label}><div><span>{label}</span><Icon size={17}/></div><strong>{value}</strong><small>{note}</small></section>)}</div>
  <div className="admin-revenue-grid">
   <BillingSettings settings={s} now={data.serverTime} phase={phase} busy={busy} save={save}/>
   <section className="admin-surface"><div className="admin-section-heading"><div><h2>По месяцам</h2><p>Брони, оборот и доход сервиса</p></div><TrendingUp size={20}/></div>
    {data.monthly?.length?<table className="admin-revenue-table"><thead><tr><th>Месяц</th><th>Брони</th><th>Оборот</th><th>Доход</th></tr></thead><tbody>{data.monthly.map((r:Row)=><tr key={r.month}><td>{monthName(r.month)}</td><td>{r.bookings}</td><td>{money(r.turnover)}</td><td>{money(r.charged)}<small>прогноз {money(r.projected)}</small></td></tr>)}</tbody></table>:<p className="admin-muted">Подтверждённых броней пока нет. Прогноз появится после первой брони.</p>}
    <dl className="admin-facts"><div><dt>Всего броней через сервис</dt><dd>{data.allTime?.bookings||0}</dd></div><div><dt>Прогноз за всё время</dt><dd>{money(data.allTime?.projected)}</dd></div><div><dt>Начислено за всё время</dt><dd>{money(data.allTime?.charged)}</dd></div><div><dt>Запросов к ИИ за 30 дней</dt><dd>{data.aiRequests30||0}</dd></div></dl>
   </section>
  </div>
  <div className="admin-revenue-grid">
   <section className="admin-surface"><div className="admin-section-heading"><div><h2>Последние пополнения</h2><p>Пополнения, бонусы и корректировки</p></div><CircleDollarSign size={20}/></div>{data.topups?.length?data.topups.map((t:Row)=><div className="admin-job" key={t.id}><span><strong>{t.owner_name||'Владелец'} · {kinds[t.kind]}</strong><small>{day(t.created_at)} · {t.note}</small></span><b className="admin-revenue-amount">{t.amount>0?'+':''}{money(t.amount)}</b></div>):<p className="admin-muted">Операций пока нет.</p>}</section>
   <section className="admin-surface"><div className="admin-section-heading"><div><h2>Журнал условий</h2><p>Кто и когда менял плату</p></div><History size={20}/></div>{data.history?.length?data.history.map((h:Row,i:number)=><div className="admin-job" key={i}><span><strong>{h.enabled?`Комиссия ${String(h.ratePercent).replace('.',',')}% с ${day(h.startsAt)}`:'Плата выключена'}</strong><small>{day(h.at)}{h.enabled&&h.freeBookings?` · бесплатных броней: ${h.freeBookings}`:''}</small></span></div>):<p className="admin-muted">Условия ещё не менялись. Сейчас действует бесплатный период.</p>}</section>
  </div>
  <OwnerBalances data={data} busy={busy} save={save} phase={phase}/>
 </div>;
}

function BillingSettings({settings:s,now,phase,busy,save}:{settings:Row;now:number;phase:string;busy:boolean;save:Save}){
 const [enabled,setEnabled]=useState(!!s.enabled),[rate,setRate]=useState(String((s.rate_bp??500)/100)),[minFee,setMinFee]=useState(String(s.min_fee||0)),[maxFee,setMaxFee]=useState(String(s.max_fee||0)),[free,setFree]=useState(String(s.free_bookings??3)),[start,setStart]=useState(isoDay(s.enabled&&s.starts_at>now?s.starts_at:now+30*86400));
 const r=Number(rate)||0,min=Number(minFee)||0,max=Number(maxFee)||0;
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=new FormData(e.currentTarget),chosen=Math.floor(Date.parse(start+'T00:00:00+05:00')/1000);
  await save('billing/settings',{enabled,ratePercent:r,minFee:min,maxFee:max,freeBookings:Number(free)||0,startsAt:Math.max(chosen,Math.floor(Date.now()/1000)),expectedVersion:s.version,confirmed:form.get('confirmed')==='on'});
 }
 const soon=enabled&&Date.parse(start+'T00:00:00+05:00')/1000<now+14*86400;
 return <form className="admin-surface inline-form" onSubmit={submit}><div className="admin-section-heading"><div><h2>Условия оплаты</h2><p>Комиссия с владельца за каждую бронь через приложение</p></div><span className={'admin-pill '+(phase==='off'?'':'positive')}>{phase==='off'?'Бесплатный период':phase==='scheduled'?'Запланирована':'Включена'}</span></div>
  <label className="check-label"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Брать комиссию с владельцев</label>
  <div className="admin-revenue-fields">
   <label>Комиссия, %<Input type="number" inputMode="decimal" min={0} max={30} step={0.1} value={rate} onChange={e=>setRate(e.target.value)} required/></label>
   <label>Бесплатных броней каждому<Input type="number" inputMode="numeric" min={0} max={1000} value={free} onChange={e=>setFree(e.target.value)}/></label>
   <label>Минимум за бронь, ₸<Input type="number" inputMode="numeric" min={0} value={minFee} onChange={e=>setMinFee(e.target.value)}/></label>
   <label>Максимум за бронь, ₸<Input type="number" inputMode="numeric" min={0} value={maxFee} onChange={e=>setMaxFee(e.target.value)} placeholder="0 — без ограничения"/></label>
   {enabled&&<label>Начать с<Input type="date" min={isoDay(now)} value={start} onChange={e=>setStart(e.target.value)} required/></label>}
  </div>
  <p className="admin-revenue-example">Пример: с брони на 15 000 ₸ владелец заплатит {money(feeFor(15000,r,min,max))}, с почасовой брони на 4 000 ₸ заплатит {money(feeFor(4000,r,min,max))}.</p>
  {enabled&&<p className="admin-muted">Владельцы получат уведомление в приложении. {soon?'Лучше дать им хотя бы 2 недели, а лучше месяц.':'Брони, подтверждённые до этой даты, останутся бесплатными.'} Отменённые брони никогда не оплачиваются.</p>}
  <label className="check-label"><input name="confirmed" type="checkbox" required/>{enabled?'Я понимаю, что владельцы будут платить по этим условиям.':'Сохранить бесплатный период.'}</label>
  <Button disabled={busy}>Сохранить условия</Button>
 </form>;
}

function OwnerBalances({data,busy,save,phase}:{data:Row;busy:boolean;save:Save;phase:string}){
 const [query,setQuery]=useState(''),[all,setAll]=useState(false),list:Row[]=data.owners||[];
 const found=query.trim()?list.filter(o=>String(o.name).toLowerCase().includes(query.trim().toLowerCase())):list,shown=all||query.trim()?found:found.slice(0,8);
 return <section className="admin-surface"><div className="admin-section-heading"><div><h2>Балансы владельцев</h2><p>{data.debtors?`С минусом: ${data.debtors}. Они показаны первыми.`:'Пополнение отмечайте, когда деньги пришли вам на Kaspi.'}</p></div><Wallet size={20}/></div>
  {list.length>8&&<label className="admin-revenue-search"><span className="sr-only">Найти владельца</span><Input value={query} onChange={e=>setQuery(e.target.value)} maxLength={100} placeholder="Найти владельца по имени"/></label>}
  {shown.length?shown.map(o=><OwnerBalance key={o.id} owner={o} busy={busy} save={save} phase={phase}/>):<p className="admin-muted">{list.length?'Никого не нашли.':'Владельцев с объектами пока нет.'}</p>}
  {!query.trim()&&found.length>8&&<Button variant="outline" className="admin-revenue-more" onClick={()=>setAll(!all)}>{all?'Свернуть список':`Показать всех: ${found.length}`}</Button>}
 </section>;
}

function OwnerBalance({owner:o,busy,save,phase}:{owner:Row;busy:boolean;save:Save;phase:string}){
 const [kind,setKind]=useState('topup'),[key,setKey]=useState(()=>crypto.randomUUID());
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);const result=await save('billing/balance',{ownerId:o.id,kind,amount:Number(form.get('amount')),note:String(form.get('note')||''),requestKey:key,confirmed:form.get('confirmed')==='on'});if(result)setKey(crypto.randomUUID());}
 return <details className="admin-revenue-owner"><summary><span><strong>{o.name}</strong><small>Объекты: {o.properties} · брони: {o.bookings}{phase!=='off'?` · бесплатных осталось: ${o.freeLeft}`:''}</small></span><span className={'admin-pill '+(o.balance<0?'warning':o.balance>0?'positive':'')}>{money(o.balance)}</span><ChevronRight size={16}/></summary>
  <dl className="admin-facts"><div><dt>Пополнено и бонусы</dt><dd>{money(o.credited)}</dd></div><div><dt>Начислено комиссии</dt><dd>{money(o.charged)}</dd></div><div><dt>Прогноз по всем броням</dt><dd>{money(o.projected)}</dd></div></dl>
  <form className="inline-form" onSubmit={submit}><div className="admin-revenue-fields"><label>Операция<NativeSelect value={kind} onChange={e=>setKind(e.target.value)}><option value="topup">Пополнение (деньги получены)</option><option value="bonus">Бонус от сервиса</option><option value="adjustment">Корректировка (можно с минусом)</option></NativeSelect></label><label>Сумма, ₸<Input name="amount" type="number" inputMode="numeric" min={kind==='adjustment'?-10000000:1} max={10000000} required/></label></div><label>Комментарий<Input name="note" maxLength={300} required placeholder={kind==='topup'?'Например: перевод Kaspi от 12 ноября':'За что'}/></label><label className="check-label"><input name="confirmed" type="checkbox" required/>{kind==='topup'?'Деньги пришли мне на счёт.':'Я согласовал эту операцию.'}</label><Button disabled={busy}>Записать</Button></form>
 </details>;
}
