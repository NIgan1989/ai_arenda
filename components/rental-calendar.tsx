'use client';
import {Component,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import FullCalendar,{type CalendarRef} from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import listPlugin from '@fullcalendar/react/list';
import themePlugin from '@fullcalendar/react/themes/monarch';
import ru from '@fullcalendar/react/locales/ru';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/monarch/theme.css';
import '@fullcalendar/react/themes/monarch/palettes/red.css';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {NativeSelect} from './ui/native-select';
import {useActivityClock} from './activity-clock';
import {CalendarAgenda} from './calendar-agenda';
import {calendarEvents} from '../lib/calendar-events';
import './rental-calendar.css';
type Row=Record<string,any>;
class CalendarBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?this.props.fallback:this.props.children;}}
export function RentalCalendar({data,role,busy,onOpen}:{data:Row;role:string;busy:boolean;onOpen:(kind:string,id:string)=>void}){
 const [property,setProperty]=useState(''),[mounted,setMounted]=useState(false),[initialView,setInitialView]=useState('timeGridWeek'),[activeView,setActiveView]=useState('timeGridWeek'),[compact,setCompact]=useState(false),[rangeTitle,setRangeTitle]=useState(''),calendar=useRef<CalendarRef>(null),now=useActivityClock()||data.serverTime||Math.floor(Date.now()/1000);
 useEffect(()=>{const media=window.matchMedia('(max-width:700px)');setCompact(media.matches);setInitialView(media.matches?'listWeek':'timeGridWeek');setActiveView(media.matches?'listWeek':'timeGridWeek');setMounted(true);const change=()=>{setCompact(media.matches);const view=media.matches?'listWeek':'timeGridWeek';setActiveView(view);calendar.current?.getApi().changeView(view);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const minute=Math.floor(now/60);const events=useMemo(()=>calendarEvents(data,role,property,now),[data.bookings,data.jobs,data.user?.id,role,property,minute]);
 return <section className="modern-calendar" aria-label="Календарь аренды"><div className="calendar-context-toolbar">{role==='owner'&&<label>Объект<NativeSelect value={property} onChange={e=>setProperty(e.target.value)}><option value="">Все объекты</option>{(data.ownProperties||[]).map((p:Row)=><option key={p.id} value={p.id}>{p.title}</option>)}</NativeSelect></label>}<div className="calendar-legend"><span><i style={{background:'#9d452f'}}/>Проживание</span>{role!=='guest'&&<span><i style={{background:'#467d79'}}/>Уборка</span>}<span><i style={{background:'#bd8a38'}}/>Заявка</span></div></div><details className="calendar-note"><summary>Время Казахстана · UTC+5</summary><p>Нажмите на событие, чтобы открыть действия. Даты в расписании не подтверждают фактический выезд или приёмку.</p></details>{!mounted?<p role="status">Открываю календарь…</p>:<CalendarBoundary fallback={<CalendarAgenda data={data} role={role} busy={busy} onOpen={onOpen}/>}><><div className="rental-calendar-controls"><div className="calendar-date-navigation"><button type="button" aria-label="Предыдущий период" onClick={()=>calendar.current?.getApi().prev()}><ChevronLeft size={18}/></button><button type="button" onClick={()=>calendar.current?.getApi().today()}>Сегодня</button><button type="button" aria-label="Следующий период" onClick={()=>calendar.current?.getApi().next()}><ChevronRight size={18}/></button><h2 aria-live="polite">{rangeTitle}</h2></div><div className="calendar-view-switch" role="group" aria-label="Вид календаря">{[['timeGridWeek','Неделя'],['dayGridMonth','Месяц'],['listWeek','Список']].map(([view,label])=><button type="button" key={view} aria-pressed={activeView===view} onClick={()=>{setActiveView(view);calendar.current?.getApi().changeView(view);}}>{label}</button>)}</div></div><FullCalendar ref={calendar} plugins={[themePlugin,dayGridPlugin,timeGridPlugin,listPlugin]} initialView={initialView} locale={ru} timeZone="Asia/Almaty" firstDay={1} headerToolbar={false} datesSet={info=>{setRangeTitle(info.view.title);setActiveView(info.view.type);}} titleFormat={{day:'numeric',month:'short',year:'numeric'}} height={activeView==='listWeek'?'auto':compact?420:600} dayHeaderFormat={{weekday:'short'}} views={{dayGridMonth:{titleFormat:{month:'long',year:'numeric'}}}} nowIndicator events={events} editable={false} selectable={false} allDaySlot={false} slotMinTime="00:00:00" slotMaxTime="24:00:00" scrollTime="08:00:00" eventClick={info=>{if(!busy)onOpen(info.event.extendedProps.kind,info.event.extendedProps.entityId);}}/></></CalendarBoundary>}</section>;
}
