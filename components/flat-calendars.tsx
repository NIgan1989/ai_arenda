'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,CalendarDays,Check,Copy,Link2} from 'lucide-react';
import {calendarStatus,CALENDAR_HELP} from '../lib/flat-calendars';
import './flat-calendars.css';
type Row=Record<string,any>;
type API=(path:string,body?:Row)=>Promise<any>;

// Linking a flat with its listings on other platforms, so one flat is never booked twice:
// the owner pastes the platform's link here and copies this service's link there.
export function FlatCalendars({propertyId,api,onBack}:{propertyId:string;api:API;onBack:()=>void}){
 const [state,setState]=useState<Row|null>(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[link,setLink]=useState(''),[copied,setCopied]=useState(false);
 async function load(){try{setState(await api('operations/calendar/flat',{propertyId}));}catch(e:any){setError(e?.message||'Не удалось загрузить календари.');}}
 useEffect(()=>{load();},[propertyId]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNote('');try{await action();await load();}catch(e:any){setError(e?.message||'Не получилось.');}finally{setBusy(false);}}
 const connect=()=>run(async()=>{const r=await api('operations/calendar/connect',{propertyId,url});setNote(r.message);if(!r.failed)setUrl('');});
 const toggle=(s:Row)=>run(async()=>{const r=await api('operations/calendar/source',{id:s.id,propertyId,label:s.label,expectedVersion:s.version,enabled:!s.enabled});setNote(r.message||'');});
 const share=()=>run(async()=>{const r=await api('operations/calendar/export',{propertyId});setLink(r.url);setCopied(false);});
 async function copy(){try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setError('Не удалось скопировать. Выделите ссылку и скопируйте вручную.');}}
 return <section className="pq pe fc" aria-labelledby="fc-title">
  <header className="pe-bar"><button type="button" className="pq-icon" onClick={onBack} aria-label="Назад к списку" disabled={busy}><ArrowLeft size={20}/></button><h2 id="fc-title">Календари площадок</h2></header>
  <div className="pe-body">
   <p className="pe-hint">Если жильё есть на Airbnb, Booking или Суточно, свяжите календари, и одно жильё не забронируют дважды.</p>
   <p className="pq-h">Занятость с других площадок</p>
   {!state&&!error&&<p className="pe-hint">Загружаю…</p>}
   {(state?.sources?.length||0)>0&&<ul className="fc-list">{state!.sources.map((s:Row)=>{const st=calendarStatus(s);return <li key={s.id} className={'is-'+st.tone}>
    <span className="pe-ico"><CalendarDays size={16}/></span><span className="pe-text"><strong>{s.label}</strong><small>{st.text}</small></span>
    {s.automatic===1&&<button type="button" className="pe-later" disabled={busy} onClick={()=>toggle(s)}>{s.enabled?'Отключить':'Включить'}</button>}
   </li>;})}</ul>}
   <label className="pq-field"><span>Ссылка на календарь площадки</span><input type="url" inputMode="url" value={url} maxLength={2000} placeholder="https://www.airbnb.ru/calendar/ical/…" onChange={e=>setUrl(e.target.value)}/></label>
   <details className="fc-help"><summary>Где взять ссылку</summary><ul>{CALENDAR_HELP.map(h=><li key={h.name}><b>{h.name}:</b> {h.where}</li>)}</ul></details>
   <button type="button" className="pq-primary fc-button" disabled={busy||!url.trim()} onClick={connect}>{busy?'Подключаю…':<><Link2 size={18}/>Подключить</>}</button>
   <p className="pq-h">Ссылка для других площадок</p>
   <p className="pe-hint">Вставьте её в импорт календаря на Airbnb или Booking, тогда брони отсюда закроют даты и там. В ссылке только занятые даты, без имён и адресов.{state?.exportLinks?' Выданных ссылок: '+state.exportLinks+'.':''}</p>
   {link?<div className="fc-link"><input readOnly value={link} aria-label="Ссылка на календарь жилья" onFocus={e=>e.currentTarget.select()}/><button type="button" className="pq-send fc-copy" onClick={copy}>{copied?<><Check size={16}/>Скопировано</>:<><Copy size={16}/>Скопировать</>}</button></div>
    :<button type="button" className="pq-ghost fc-button" disabled={busy} onClick={share}><Link2 size={18}/>Получить ссылку</button>}
   {note&&<p className="fc-note" role="status">{note}</p>}
   {error&&<p className="pq-error" role="alert">{error}</p>}
  </div>
 </section>;
}
