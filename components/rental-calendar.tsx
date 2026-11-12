'use client';
import {useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Brush,KeyRound} from 'lucide-react';
import {NativeSelect} from './ui/native-select';
import {useActivityClock} from './activity-clock';
import {calendarEntries,entriesOn,monthGrid,shiftMonth,sameMonth,dayStart,dayNumber,dayLine,type CalendarEntry} from '../lib/calendar-days';
import './rental-calendar.css';
type Row=Record<string,any>;
const words=(day:number,options:Intl.DateTimeFormatOptions)=>new Date((day+18000)*1000).toLocaleDateString('ru-RU',{timeZone:'UTC',...options});
const capital=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
const weekdays=['пн','вт','ср','чт','пт','сб','вс'];
// A month to look at and a day to read. The grid marks the days that have something, the chosen day lists it in plain
// rows, and a free day offers the nearest entries instead of an empty box.
export function RentalCalendar({data,role,busy,onOpen}:{data:Row;role:string;busy:boolean;onOpen:(kind:string,id:string)=>void}){
 const now=useActivityClock()||data.serverTime||Math.floor(Date.now()/1000),today=dayStart(now),minute=Math.floor(now/60);
 const [property,setProperty]=useState(''),[chosen,setChosen]=useState<number|null>(null),[month,setMonth]=useState<number|null>(null);
 const day=chosen??today,shown=month??day;
 const entries=useMemo(()=>calendarEntries(data,role,property,now),[data.bookings,data.jobs,data.user?.id,role,property,minute]);
 const grid=useMemo(()=>monthGrid(shown),[shown]),list=entriesOn(entries,day),next=list.length?[]:entries.filter(e=>e.start>=day+86400).slice(0,3);
 const present=new Set(grid.flatMap(d=>entriesOn(entries,d).map(e=>e.tone))),legend=([['stay','Проживание'],['request','Заявка'],['cleaning','Уборка'],['late','Нужна проверка'],['done','Завершено']] as const).filter(([tone])=>present.has(tone));
 const move=(by:number)=>{const target=shiftMonth(shown,by);setMonth(target);setChosen(sameMonth(target,today)?today:target);};
 const row=(e:CalendarEntry,on:number,withDate=false)=><li key={e.key}><button type="button" className={'cal-entry tone-'+e.tone} disabled={busy} onClick={()=>onOpen(e.kind,e.id)}><span className="cal-entry-icon" aria-hidden="true">{e.kind==='job'?<Brush size={18}/>:<KeyRound size={18}/>}</span><span className="cal-entry-copy"><b>{withDate?words(dayStart(e.start),{day:'numeric',month:'long'})+' · ':''}{dayLine(e,on)}</b><strong>{e.kind==='job'?'Уборка · ':''}{e.title}</strong><small>{e.status}</small></span><ChevronRight size={18} aria-hidden="true"/></button></li>;
 return <section className="cal" aria-label="Календарь аренды">
  <div className="cal-month">
   <header className="cal-head"><h2 aria-live="polite">{capital(words(shown,{month:'long',year:'numeric'}).replace(' г.',''))}</h2><div className="cal-nav"><button type="button" aria-label="Предыдущий месяц" onClick={()=>move(-1)}><ChevronLeft size={20}/></button><button type="button" className="cal-today" disabled={day===today&&sameMonth(shown,today)} onClick={()=>{setMonth(null);setChosen(null);}}>Сегодня</button><button type="button" aria-label="Следующий месяц" onClick={()=>move(1)}><ChevronRight size={20}/></button></div></header>
   {role==='owner'&&(data.ownProperties||[]).length>1&&<label className="cal-filter"><span className="sr-only">Квартира</span><NativeSelect value={property} onChange={e=>setProperty(e.target.value)}><option value="">Все квартиры</option>{(data.ownProperties||[]).map((p:Row)=><option key={p.id} value={p.id}>{p.title}</option>)}</NativeSelect></label>}
   <div className="cal-grid" role="grid" aria-label="Дни месяца"><div className="cal-week" role="row">{weekdays.map(w=><span key={w} role="columnheader">{w}</span>)}</div>{Array.from({length:6},(_,w)=><div className="cal-week" role="row" key={w}>{grid.slice(w*7,w*7+7).map(d=>{const marks=entriesOn(entries,d),tones=[...new Set(marks.map(e=>e.tone))].slice(0,3);return <button type="button" role="gridcell" key={d} aria-selected={d===day} aria-current={d===today?'date':undefined} aria-label={words(d,{day:'numeric',month:'long'})+(marks.length?', записей: '+marks.length:'')} className={'cal-day'+(sameMonth(d,shown)?'':' is-out')+(d===today?' is-today':'')+(d===day?' is-chosen':'')} onClick={()=>{setChosen(d);if(!sameMonth(d,shown))setMonth(d);}}><span>{dayNumber(d)}</span><i aria-hidden="true">{tones.map(t=><em key={t} className={'tone-'+t}/>)}</i></button>;})}</div>)}</div>
   {legend.length>0&&<p className="cal-legend">{legend.map(([tone,label])=><span key={tone}><em className={'tone-'+tone}/>{label}</span>)}</p>}
  </div>
  <div className="cal-agenda">
   <h3>{capital(words(day,{weekday:'long',day:'numeric',month:'long'}))}{day===today&&<small>Сегодня</small>}</h3>
   {list.length>0?<ul>{list.map(e=>row(e,day))}</ul>:<><p className="cal-free">{role==='cleaner'?'На этот день уборок нет.':'На этот день ничего не запланировано.'}</p>{next.length>0&&<><h4>Ближайшее</h4><ul>{next.map(e=>row(e,dayStart(e.start),true))}</ul></>}</>}
   <p className="cal-note">Время Казахстана. Дата в календаре не подтверждает фактический выезд или приёмку уборки.</p>
  </div>
 </section>;
}
