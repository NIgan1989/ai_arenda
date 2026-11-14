'use client';
import {useState,type ReactNode} from 'react';
import {Brush,CalendarDays,ChevronRight,Eye,KeyRound,MapPin,Pencil,Plus,ScrollText,Sparkles,UserCheck,Wallet,Zap} from 'lucide-react';
import type {Approval} from '../lib/approvals';
import {calendarEntries,dayLine,dayStart,type CalendarEntry} from '../lib/calendar-days';
import {HUB_TABS,hubToday,type HubTab} from '../lib/property-hub';
import {PriceTipBody} from './price-tip';
import {RentalCalendar} from './rental-calendar';
import {FlatAutopilotRow} from './flat-autopilot';
import './property-hub.css';
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const dateWords=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long'});

type HubProps={
 property:Row;data:Row;now:number;tab:HubTab;onTab:(tab:HubTab)=>void;
 /** False while the sheet is folded: only the tabs are shown, and a tap on one unfolds the sheet. */
 open:boolean;
 /** A booking or a cleaning of this flat: shown on the map where it can be, in its card otherwise. */
 onOpen:(kind:string,id:string)=>void;
 /** The editor of the flat, opened on one of its steps. */
 onEdit:(step?:string)=>void;
 /** 'settings': rules and readiness; 'job': a new cleaning; 'preview': the listing as guests see it. */
 onStep:(step:'settings'|'job'|'preview')=>void;
 onPoint:()=>void;pointNote:string;onChanged?:()=>void;
};

// The owner's flat as one card of four tabs: what happens today, its calendar, its prices and its settings.
// Everything about one flat that used to live on separate pages («Календарь», «Уборки», «Управление») is reached from here.
export function PropertyHub({property,data,now,tab,open,onTab,onOpen,onEdit,onStep,onPoint,pointNote,onChanged}:HubProps){
 const today=dayStart(now),entries=calendarEntries(data,'owner',property.id,now),view=hubToday(entries,now);
 return <div className="hub">
  <div className="hub-tabs" role="tablist" aria-label="Разделы жилья">{HUB_TABS.map(([id,label])=><button key={id} type="button" role="tab" id={'hub-tab-'+id} aria-selected={open&&tab===id} aria-controls="hub-panel" onClick={()=>onTab(id)}>{label}{id==='today'&&view.waiting.length>0&&<i aria-label={'ждут ответа: '+view.waiting.length}>{view.waiting.length}</i>}</button>)}</div>
  {open&&<div className="hub-panel" id="hub-panel" role="tabpanel" aria-labelledby={'hub-tab-'+tab}>
   {tab==='today'&&<Today view={view} today={today} onOpen={onOpen} onJob={()=>onStep('job')} ownStaff={!!Number(property.own_staff)}/>}
   {tab==='calendar'&&<>
    <RentalCalendar data={data} role="owner" busy={false} onOpen={onOpen} propertyId={property.id}/>
    {row(<CalendarDays size={20}/>,'Календари площадок','Airbnb, Booking, Суточно: без двойных броней',()=>onEdit('calendars'))}
   </>}
   {tab==='price'&&<Prices property={property} cards={(data.approvals||[]) as Approval[]} onEdit={onEdit} onChanged={onChanged}/>}
   {tab==='settings'&&<div className="hub-rows">
    <FlatAutopilotRow propertyId={property.id} onChanged={onChanged}/>
    {row(<Pencil size={20}/>,'Объявление','Фото, описание, удобства, заезд',()=>onEdit())}
    {row(<ScrollText size={20}/>,'Правила и готовность','Автоподтверждение, депозит, готовность к заселению',()=>onStep('settings'))}
    {!Number(property.own_staff)&&row(<UserCheck size={20}/>,'Постоянный исполнитель',property.regular_cleaner_name||'Закрепите своего: уборки приходят сначала к нему',()=>onEdit('cleaner'))}
    {link(<Zap size={20}/>,'Автоматизация уборок','Когда и за сколько сервис сам создаёт уборку','/workspace/owner/operations?tab=dispatch')}
    {link(<KeyRound size={20}/>,'Ключи и доступ','Инструкция заселения для гостя и исполнителя','/workspace/owner/operations?tab=access')}
    {row(<MapPin size={20}/>,'Точка на карте',pointNote,onPoint)}
    {row(<Eye size={20}/>,'Как видят гости','Объявление целиком',()=>onStep('preview'))}
   </div>}
  </div>}
 </div>;
}

const row=(icon:ReactNode,title:string,note:string,onPress:()=>void)=><button type="button" className="hub-row" onClick={onPress}><span className="hub-row-icon" aria-hidden="true">{icon}</span><span className="hub-row-text"><strong>{title}</strong>{note&&<small>{note}</small>}</span><ChevronRight size={18} aria-hidden="true"/></button>;
const link=(icon:ReactNode,title:string,note:string,href:string)=><a className="hub-row" href={href}><span className="hub-row-icon" aria-hidden="true">{icon}</span><span className="hub-row-text"><strong>{title}</strong><small>{note}</small></span><ChevronRight size={18} aria-hidden="true"/></a>;

function Today({view,today,onOpen,onJob,ownStaff}:{view:ReturnType<typeof hubToday>;today:number;onOpen:(kind:string,id:string)=>void;onJob:()=>void;ownStaff:boolean}){
 const entry=(e:CalendarEntry,line:string)=><li key={e.key}><button type="button" className={'hub-entry tone-'+e.tone} onClick={()=>onOpen(e.kind,e.id)}><span className="hub-row-icon" aria-hidden="true">{e.kind==='job'?<Brush size={20}/>:<KeyRound size={20}/>}</span><span className="hub-row-text"><strong>{line}</strong><small>{e.kind==='job'?'Уборка · ':''}{e.status}</small></span><ChevronRight size={18} aria-hidden="true"/></button></li>;
 return <>
  {view.waiting.length>0&&<><h3 className="hub-heading">Ждут ответа</h3><ul className="hub-list">{view.waiting.map(e=>entry(e,(e.kind==='job'?'Уборка ':'Заезд ')+dateWords(e.start)))}</ul></>}
  <h3 className="hub-heading">Сегодня</h3>
  {view.today.length>0?<ul className="hub-list">{view.today.map(e=>entry(e,dayLine(e,today)))}</ul>:<p className="hub-note">Сегодня ничего не запланировано.</p>}
  {view.next.length>0&&<><h3 className="hub-heading">Дальше</h3><ul className="hub-list">{view.next.map(e=>entry(e,dateWords(e.start)+' · '+dayLine(e,dayStart(e.start))))}</ul></>}
  {!ownStaff&&<button type="button" className="hub-add" onClick={onJob}><Plus size={18} aria-hidden="true"/>Создать уборку</button>}
 </>;
}

function Prices({property,cards,onEdit,onChanged}:{property:Row;cards:Approval[];onEdit:(step?:string)=>void;onChanged?:()=>void}){
 const policy=property.policy||{},[busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 // The AI administrator's advice about this flat's price: answered here, as on the map.
 const card=cards.find(c=>c.canDecide&&(c.kind==='price'&&c.price?.propertyId===property.id||c.kind==='window'&&c.window?.propertyId===property.id));
 async function decide(action:string){
  if(!card||busy)return;setBusy(true);setSaid(null);
  try{const r=await fetch('/api/approvals',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Workspace-Role':'owner'},body:JSON.stringify({id:card.id,revision:card.revision,action})}),v=await r.json() as Row;
   setSaid({text:r.ok?v.message||'Готово.':v.error||'Не получилось. Обновите экран.',error:!r.ok});onChanged?.();}
  catch{setSaid({text:'Нет связи. Цена не изменилась, попробуйте ещё раз.',error:true});}
  finally{setBusy(false);}
 }
 const facts:[string,string][]=[['За сутки',money(Number(property.price)||0)],...(Number(policy.nightly_price)?[['За ночь',money(Number(policy.nightly_price))] as [string,string]]:[]),['За час',Number(policy.hourly_price)?money(Number(policy.hourly_price))+' · от '+(Number(policy.min_hours)||2)+' ч':'не сдаётся по часам'],['Депозит',Number(policy.deposit)?money(Number(policy.deposit)):'не требуется']];
 return <>
  <dl className="hub-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {said&&<p className={'hub-note'+(said.error?' is-error':'')} role={said.error?'alert':'status'}>{said.text}</p>}
  {card&&<section className="hub-advice" aria-label="Совет AI администратора"><h3><Sparkles size={16} aria-hidden="true"/>{card.kind==='window'?'Окно в календаре':'Совет AI администратора'}</h3><PriceTipBody card={card} busy={busy} onDecide={decide}/></section>}
  <button type="button" className="hub-add" onClick={()=>onEdit('prices')}><Wallet size={18} aria-hidden="true"/>Изменить цены</button>
 </>;
}
