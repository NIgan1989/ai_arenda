'use client';
import {useEffect,useState} from 'react';
import {Brush,CalendarClock,CalendarDays,Camera,Check,Clock3,FileText,KeyRound,Lightbulb,ShieldAlert,ShieldCheck,Sparkles,TrendingDown,TrendingUp,Wallet,X} from 'lucide-react';
import type {Approval} from '../lib/approvals';
import './price-tip.css';
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const hiddenKey='ai-arenda-price-tip-later';
function laterIds():string[]{try{return JSON.parse(sessionStorage.getItem(hiddenKey)||'[]');}catch{return [];}}

// The AI administrator's price advice, shown like a notification on top of the owner's map.
// Two buttons: the owner raises (or lowers) the price, or leaves it. «Позже» only hides it for now.
// A calendar window: free hours between two stays, offered to guests by the hour at a discount.
function WindowTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const w=card.window!;
 return <>
  <p className="price-tip-when"><CalendarClock size={16} aria-hidden="true"/><span>{w.when}</span><b>{w.hours} ч</b></p>
  <div className="price-tip-price" aria-label={'Час сейчас '+money(w.from)+', в окне '+money(w.to)}>
   <span className="price-tip-from">{money(w.from)}</span><span className="price-tip-arrow" aria-hidden="true">→</span><strong className="price-tip-to">{money(w.to)}<small> / час</small></strong>
   <span className="price-tip-delta is-window">−{w.percent}%</span>
  </div>
  <p className="price-tip-why">Пустует между бронями. Скидку гости увидят только в эти часы.</p>
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button>
  </div>
  {!compact&&<p className="price-tip-note">Без вашего согласия гостям ничего не покажем.</p>}
 </>;
}

// The week ahead: seven evenings of the city, the busy ones tall and bright, the quiet ones low.
export function ForecastDays({days}:{days:NonNullable<Approval['forecast']>['days']}){
 return <ol className="forecast-days" aria-label="Загрузка города по вечерам">
  {days.map(d=><li key={d.label+d.date} className={'is-'+d.level} aria-label={d.label+' '+d.date+': занято '+d.load+'%'}>
   <span className="forecast-bar" aria-hidden="true"><i style={{height:Math.max(8,d.load)+'%'}}/></span>
   <b>{d.label}</b><small>{d.load}%</small>
  </li>)}
 </ol>;
}
function ForecastTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const f=card.forecast!,priced=f.advice==='raise'||f.advice==='lower';
 return <>
  <ForecastDays days={f.days}/>
  <p className="price-tip-why is-summary">{f.summary}.</p>
  {priced&&<div className="price-tip-price" aria-label={'Сейчас '+money(f.from)+', предлагаю '+money(f.to)}>
   <span className="price-tip-from">{money(f.from)}</span><span className="price-tip-arrow" aria-hidden="true">→</span><strong className="price-tip-to">{money(f.to)}</strong>
   <span className={'price-tip-delta'+(f.advice==='raise'?' is-up':' is-down')}>{(f.advice==='raise'?'+':'−')+f.percent}%</span>
  </div>}
  {f.advice==='min_hours'&&<div className="price-tip-price" aria-label={'Минимум '+f.from+' ч, предлагаю '+f.to+' ч'}>
   <span className="price-tip-from">от {f.from} ч</span><span className="price-tip-arrow" aria-hidden="true">→</span><strong className="price-tip-to">от {f.to} ч</strong>
  </div>}
  {f.advice!=='none'&&<p className="price-tip-why">«{f.title}» свободна в эти дни{compact?'':'. '+f.reasons.join(' · ')}</p>}
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button>
  </div>
  {!compact&&f.advice!=='none'&&<p className="price-tip-note">Без вашего согласия ничего не изменится.</p>}
 </>;
}

// Listing quality: the flat next to similar flats that are booked more often, and one button.
function ListingTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const l=card.listing!,Icon=l.kind==='photos'?Camera:l.kind==='checkin'?KeyRound:l.kind==='text'?FileText:Lightbulb;
 const compare=l.kind==='photos'?[[String(l.mine),'фото у вас'],[String(l.theirs),'у тех, кого бронируют чаще']]:l.kind==='text'?[[String(l.mine),'знаков у вас'],[String(l.theirs),'у тех, кого бронируют чаще']]
  :l.kind==='amenity'?[['Нет','у вас: '+l.amenity.toLocaleLowerCase('ru')],[l.count+' из '+l.leaders,'отмечают у себя']]:l.kind==='hourly'?[['—','почасовой цены нет'],[money(l.value),'в час, как у '+l.count+' из '+l.leaders]]:[['Встреча','сейчас у вас'],[l.count+' из '+l.leaders,'заселяют без встречи']];
 return <>
  <div className="listing-compare">
   <span className="listing-compare-mine"><b>{compare[0][0]}</b><small>{compare[0][1]}</small></span>
   <span className="listing-compare-arrow" aria-hidden="true"><Icon size={18}/></span>
   <span className="listing-compare-them"><b>{compare[1][0]}</b><small>{compare[1][1]}</small></span>
  </div>
  <p className="price-tip-why is-full">{l.text}</p>
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button>
  </div>
  {!compact&&<p className="price-tip-note">Сравниваю с похожими квартирами в вашем городе за последние 2 месяца.</p>}
 </>;
}

// Cleaning price: the flat's price next to what similar flats pay (or what cleaners refused), and one button.
function CleaningTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const c=card.cleaningTip!;
 return <>
  <div className="listing-compare">
   <span className="listing-compare-mine"><b>{money(c.from)}</b><small>{c.refused?'отказов: '+c.refused:'сейчас у вас'}</small></span>
   <span className="listing-compare-arrow" aria-hidden="true"><Brush size={18}/></span>
   <span className="listing-compare-them"><b>{money(c.to)}</b><small>{c.typical?'платят за похожие':'предлагаю'}</small></span>
  </div>
  <p className="price-tip-why is-full">{c.text}</p>
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button>
  </div>
  {!compact&&<p className="price-tip-note">Открытые уборки уйдут исполнителям заново по новой цене. Без вашего согласия ничего не изменится.</p>}
 </>;
}

// Late checkout or early check-in for the guest who asked about it in the booking chat.
function StayTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const o=card.stay!;
 return <>
  <p className="price-tip-when"><Clock3 size={16} aria-hidden="true"/><span>{o.kind==='late'?'Выезд ':'Заезд '}{o.when}</span><b>+{o.hours} ч</b></p>
  <div className="price-tip-price" aria-label={'Доплата '+money(o.extra)}>
   <strong className="price-tip-to">+{money(o.extra)}</strong><span className="price-tip-from is-plain">итого {money(o.amount)}</span>
  </div>
  <p className="price-tip-why">{o.automatic?'Календарь свободен, уборка успевает. Оформлю сразу.':'Календарь свободен, уборка успевает. Время изменится после подтверждения владельца.'}</p>
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button>
  </div>
  {!compact&&<p className="price-tip-note">Доплата войдёт в остаток к оплате по брони.</p>}
 </>;
}

// A new booking request pops up on the owner's map like an order: dates, money, the AI's risk read.
type Decision='accept'|'reject'|'deposit';
const fact=(card:Approval,label:string)=>card.facts.find(([l])=>l===label)?.[1]||'';
const guests=(v:string)=>{const n=Number(v)||1;return n+' '+(n%10===1&&n%100!==11?'гость':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'гостя':'гостей');};
function BookingTipBody({card,busy,onDecide}:{card:Approval;busy:boolean;onDecide:(action:Decision)=>void}){
 const r=card.risk!,Icon=r.level==='low'?ShieldCheck:ShieldAlert;
 return <>
  <div className="price-tip-price"><strong className="price-tip-to">{fact(card,'Проживание')}</strong><span className="price-tip-from is-plain">{card.from} · {guests(fact(card,'Гостей'))}</span></div>
  <p className="price-tip-when is-dates"><CalendarClock size={16} aria-hidden="true"/><span>{fact(card,'Заезд')} → {fact(card,'Выезд')}</span></p>
  <div className={'booking-risk is-compact is-'+r.level} role="note">
   <div className="booking-risk-head"><Icon size={18} aria-hidden="true"/><strong>{r.label}</strong>{r.held&&<span>автоподтверждение остановлено</span>}</div>
   <p className="booking-risk-line">{r.reasons.join(' · ')}</p>
  </div>
  {card.depositLabel?<>
   <div className="price-tip-actions"><button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('deposit')}><Wallet size={18} aria-hidden="true"/>{card.depositLabel}</button></div>
   <div className="price-tip-actions is-pair"><button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('accept')}>Без депозита</button><button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button></div>
  </>:<div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>{card.rejectLabel}</button>
  </div>}
 </>;
}

export function PriceTipBody({card,busy,onDecide,compact=false}:{card:Approval;busy:boolean;onDecide:(action:Decision)=>void;compact?:boolean}){
 if(card.kind==='booking'&&card.risk)return <BookingTipBody card={card} busy={busy} onDecide={onDecide}/>;
 if(card.cleaningTip)return <CleaningTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.listing)return <ListingTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.forecast)return <ForecastTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.stay)return <StayTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.window)return <WindowTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 const p=card.price!,up=p.direction==='up',Icon=up?TrendingUp:TrendingDown;
 return <>
  <div className="price-tip-price" aria-label={'Сейчас '+money(p.from)+', предлагаю '+money(p.to)}>
   <span className="price-tip-from">{money(p.from)}</span><span className="price-tip-arrow" aria-hidden="true">→</span><strong className="price-tip-to">{money(p.to)}</strong>
   <span className={'price-tip-delta'+(up?' is-up':' is-down')}><Icon size={14} aria-hidden="true"/>{(up?'+':'−')+p.percent}%</span>
  </div>
  {compact?<p className="price-tip-why">{p.reasons.slice(0,2).join(' · ')}</p>:<>
   {p.rows.length>1&&<p className="price-tip-rows">{p.rows.slice(1).map(([label,from,to])=><span key={label}>{label}: {money(from)} → {money(to)}</span>)}</p>}
   {p.reasons.length>0&&<ul className="price-tip-reasons">{p.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </>}
  <div className="price-tip-actions">
   <button type="button" className="price-tip-accept" disabled={busy} onClick={()=>onDecide('accept')}><Check size={18} aria-hidden="true"/>{card.acceptLabel}</button>
   <button type="button" className="price-tip-reject" disabled={busy} onClick={()=>onDecide('reject')}>Оставить</button>
  </div>
  {!compact&&<p className="price-tip-note">Без вашего согласия цена не изменится.</p>}
 </>;
}

export function PriceTip({cards,onChanged,onEdit,role='owner'}:{cards:Approval[];onChanged?:()=>void;onEdit?:(id:string,step:string|null)=>void;role?:'owner'|'guest'}){
 const [later,setLater]=useState<string[]>(()=>typeof window==='undefined'?[]:laterIds()),[busy,setBusy]=useState(false),[result,setResult]=useState<{text:string;error:boolean}|null>(null);
 const card=cards.find(c=>c.kind==='booking'&&c.risk&&c.canDecide&&!later.includes(c.id))||cards.find(c=>(c.kind==='price'&&c.price||c.kind==='window'&&c.window||c.kind==='stay'&&c.stay||c.kind==='forecast'&&c.forecast||c.kind==='listing'&&c.listing||c.kind==='cleaning-fee'&&c.cleaningTip)&&c.canDecide&&!later.includes(c.id));
 useEffect(()=>{if(!result)return;const t=setTimeout(()=>setResult(null),result.error?8000:5000);return()=>clearTimeout(t);},[result]);
 if(result)return <aside className="price-tip is-result" role="status"><span className={'price-tip-icon'+(result.error?' is-error':'')} aria-hidden="true">{result.error?<X size={18}/>:<Check size={18}/>}</span><p>{result.text}</p></aside>;
 if(!card)return null;
 const up=card.price?.direction==='up',kind=card.risk||card.window||card.stay||card.forecast||card.listing||card.cleaningTip?'is-window':up?'is-up':'is-down';
 async function decide(action:Decision){
  if(!card)return;setBusy(true);
  try{const r=await fetch('/api/approvals',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':role},body:JSON.stringify({id:card.id,revision:card.revision,action}),cache:'no-store'}),v=await r.json() as Row;
   if(r.ok&&v.edit&&onEdit){onChanged?.();onEdit(v.edit.propertyId,v.edit.step);return;}
   setResult({text:r.ok?v.message||'Готово.':v.error||'Не получилось. Обновите экран.',error:!r.ok});onChanged?.();}
  catch{setResult({text:card.risk?'Нет связи. Заявка не изменилась, попробуйте ещё раз.':card.listing||card.forecast||card.cleaningTip?'Нет связи. Ничего не изменилось, попробуйте ещё раз.':card.stay?'Нет связи. Время не изменилось, попробуйте ещё раз.':card.window?'Нет связи. Окно не открыто, попробуйте ещё раз.':'Нет связи. Цена не изменилась, попробуйте ещё раз.',error:true});}
  finally{setBusy(false);}
 }
 function hide(){if(!card)return;const next=[...later,card.id];setLater(next);try{sessionStorage.setItem(hiddenKey,JSON.stringify(next));}catch{}}
 return <aside className={'price-tip '+kind} aria-label={card.risk?'Новая заявка на бронирование':card.cleaningTip?'Совет AI администратора по цене уборки':card.listing?'Совет AI администратора по объявлению':card.forecast?'Прогноз загрузки на неделю от AI администратора':card.stay?'Предложение AI администратора по времени проживания':card.window?'Окно в календаре от AI администратора':'Совет AI администратора по цене'}>
  <header className="price-tip-head">
   <span className="price-tip-icon" aria-hidden="true">{card.risk?<CalendarClock size={18}/>:card.forecast?<CalendarDays size={18}/>:card.cleaningTip?<Brush size={18}/>:<Sparkles size={18}/>}</span>
   <span className="price-tip-title"><small>AI администратор · {card.risk?'новая заявка':card.cleaningTip?'цена уборки':card.listing?card.listing.title.toLocaleLowerCase('ru'):card.forecast?'прогноз на неделю':card.stay?(card.stay.kind==='late'?'поздний выезд':'ранний заезд'):card.window?'окно в календаре':up?'спрос вырос':'спрос снизился'}</small><strong>{card.subject}</strong></span>
   <button type="button" className="price-tip-close" aria-label="Позже" title="Позже" onClick={hide}><X size={18}/></button>
  </header>
  <PriceTipBody card={card} busy={busy} onDecide={decide} compact/>
 </aside>;
}
