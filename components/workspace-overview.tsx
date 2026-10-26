'use client';
import {ArrowUpRight,ArrowRight,CalendarDays,Brush,ChevronRight} from 'lucide-react';
import {Photo} from './media';
import {ActivityTimer} from './activity-clock';
import type {Role} from '../lib/domain';
type Row=Record<string,any>;
const when=(value:number)=>new Date(value*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
export function WorkspaceOverview({data,role,busy,onIntent,onEvent}:{data:Row;role:Role;busy:boolean;onIntent:(intent:string)=>void;onEvent:(event:Row)=>void}){
 const workspace=data.workspaces?.[role],events=[...(workspace?.attention||[]),...(workspace?.upcoming||[])];
 const stays=data.bookings.filter((b:Row)=>['confirmed','requested'].includes(b.status)&&!b.terms?.actual_checkout);
 const property=role==='owner'?data.ownProperties[0]:role==='guest'&&stays[0]?data.properties.find((p:Row)=>p.id===stays[0].property_id):null;
 const stay=role==='owner'?stays.find((b:Row)=>b.property_id===property?.id):role==='guest'?stays[0]:null;
 const job=role==='cleaner'?data.jobs.find((j:Row)=>j.assigned_to===data.user?.id&&['assigned','in_progress','submitted'].includes(j.status)):null;
 const item=job||property||stay;
 const destination=role==='owner'?'properties':role==='cleaner'?'assignments':'bookings';
 const emptyTitle=role==='owner'?'Ваше жильё — в надёжном ритме':role==='cleaner'?'Хорошая работа начинается с удобного задания':'Найдите место, где вам будет хорошо';
 const emptyText=role==='owner'?'Добавьте первую квартиру. Брони, подготовка заездов и уборки будут собраны здесь.':role==='cleaner'?'Выбирайте район, время и условия. Здесь появятся ваши назначения и ближайшие уборки.':'Выберите квартиру для следующей поездки. Здесь появятся даты, условия и всё важное перед заездом.';
 const start=()=>onIntent(role==='owner'?'property':role==='cleaner'?'jobs':'properties');
 return <div className="overview-layout"><section className="home-feature" aria-label={item?'Ближайшие планы':'Начало работы'}>
 <div className="home-feature-photo">{property?.photos?.[0]?<Photo id={property.photos[0]} role={role} alt={property.title}/>:item?<div className="home-feature-no-photo"><CalendarDays size={36}/><span>{role==='cleaner'?'Ваше следующее задание':'Всё важное о предстоящих планах'}</span></div>:<img src="/welcome-home.png" alt="Светлая студия — иллюстрация сервиса"/>}</div>
 <div className="home-feature-body"><div className="home-feature-title"><h2>{item?.title||emptyTitle}</h2><p>{item?[item.city,item.district].filter(Boolean).join(', ')||'Подробности в вашем кабинете':emptyText}</p></div>
 {item?<><div className="home-feature-date"><CalendarDays size={21}/><span><small>{stay?'Ближайший заезд':job?'Начало уборки':'Ваша квартира'}</small><strong>{stay?when(stay.start):job?when(job.start):property?.display_status?.label||'Управление и готовность'}</strong></span></div>{property?.display_status&&<span className={'listing-status tone-'+(property.display_status.tone||'neutral')}>{property.display_status.label}</span>}<a className="inline-button" href={'/workspace/'+role+'/'+destination}>{role==='owner'?'Открыть квартиры':role==='cleaner'?'Открыть задания':'Открыть брони'}<ArrowRight size={17}/></a></>:role==='owner'?<button className="inline-button" onClick={start} disabled={busy}>Добавить квартиру<ArrowUpRight size={18}/></button>:<a className="inline-button" href={'/workspace/'+role+'/'+(role==='cleaner'?'jobs':'catalog')}>{role==='cleaner'?'Найти уборку':'Найти квартиру'}<ArrowUpRight size={18}/></a>}</div>
 {(job&&['in_progress','submitted'].includes(job.status)||stay?.terms?.actual_checkin)&&<div className="home-feature-timer"><ActivityTimer kind={job?'job':'booking'} item={job||stay}/></div>}
 {events[0]&&<button className="home-feature-next" onClick={()=>onEvent(events[0])} disabled={busy}><span className="next-icon">{events[0].kind==='job'?<Brush size={18}/>:<CalendarDays size={18}/>}</span><strong>{events[0].title}</strong><span>{events[0].detail}</span><ArrowRight size={18}/></button>}
 </section>
 {events.length>1&&<section className="overview-events"><div className="overview-section-heading"><h2>Ближайшие события</h2><a href={'/workspace/'+role+'/calendar'}>Весь календарь<ArrowUpRight size={16}/></a></div>{events.slice(1,6).map((event:Row)=>{const item=(event.kind==='job'?data.jobs:data.bookings).find((v:Row)=>v.id===event.entityId);return <button className={'overview-event'+(event.urgent?' urgent':'')} key={event.id} disabled={busy} onClick={()=>onEvent(event)}><span className="overview-event-icon">{event.kind==='job'?<Brush size={21}/>:<CalendarDays size={21}/>}</span><span><strong>{event.title}</strong><small>{event.detail} · {when(event.at)}</small>{item&&<ActivityTimer kind={event.kind} item={item} compact/>}</span><ChevronRight size={19}/></button>;})}</section>}
 {!events.length&&<div className="overview-note"><CalendarDays size={20}/><p>Ближайших событий пока нет.<span>Когда появятся брони или задания, вы увидите их здесь.</span></p><a href={'/workspace/'+role+'/calendar'} aria-label="Открыть календарь"><ArrowUpRight size={20}/></a></div>}
 </div>;
}
