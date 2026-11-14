'use client';
import {BedDouble,Bath,CheckCircle2,Clock3,DoorOpen,House,Lock,MapPin,Ruler} from 'lucide-react';
import type {ReactNode} from 'react';
import {Photo} from './media';
import {cleaningTime,jobPlace,type PlaceFact} from '../lib/job-place';
import './job-place.css';
type Row=Record<string,any>;

const icons:Record<PlaceFact['id'],ReactNode>={rooms:<DoorOpen size={18}/>,area:<Ruler size={18}/>,beds:<BedDouble size={18}/>,bath:<Bath size={18}/>};

// The place to clean, shown to the cleaner when a cleaning is opened: photos, kind of housing, area of the city, size,
// what to clean. compact: one row for the map card, with the first photo and the short line.
export function JobPlace({job,role,compact=false}:{job:Row;role:string;compact?:boolean}){
 const v=jobPlace(job),alt='Фото жилья: '+(job.title||v.kind);
 if(compact)return <div className="job-place is-compact">
  <div className="job-place-thumb"><Photo id={v.photos[0]} role={role} alt={alt} rejectTiny fallback={<House size={22}/>}/>{v.photos.length>1&&<span>{v.photos.length}</span>}</div>
  <div className="job-place-line"><strong>{v.summary}</strong>{v.where&&<small><MapPin size={13} aria-hidden="true"/>{v.where}</small>}{v.tasks.length>0&&<small className="job-place-line-todo">{v.tasks.join(' · ')}</small>}</div>
 </div>;
 return <section className="job-place" aria-label="Жильё для уборки">
  <div className="job-place-gallery" data-count={v.photos.length||0}>
   {v.photos.length?v.photos.slice(0,8).map((id,i)=><figure key={id}><Photo id={id} role={role} alt={alt+(v.photos.length>1?', '+(i+1)+' из '+v.photos.length:'')} rejectTiny fallback={<House size={28}/>}/></figure>)
    :<figure className="is-empty"><House size={32} aria-hidden="true"/><small>Владелец ещё не добавил фото</small></figure>}
   <span className="job-place-kind">{v.kind}</span>
   {v.photos.length>1&&<span className="job-place-count">{v.photos.length} фото · листайте</span>}
  </div>
  <div className="job-place-body">
   <p className="job-place-where"><MapPin size={16} aria-hidden="true"/><span><strong>{v.where||'Район не указан'}</strong>{v.floor&&<small className="job-place-floor">{v.floor}</small>}{!v.exact&&<small><Lock size={12} aria-hidden="true"/>Точный адрес откроется после назначения</small>}</span></p>
   {v.facts.length>0&&<ul className="job-place-facts">{v.facts.map(f=><li key={f.id}><span aria-hidden="true">{icons[f.id]}</span><strong>{f.value}</strong><small>{f.label}</small></li>)}</ul>}
   {v.tasks.length>0&&<div className="job-place-todo"><h4>Что убрать{v.minutes>0&&<span><Clock3 size={14} aria-hidden="true"/>{cleaningTime(v.minutes)}</span>}</h4><ul>{v.tasks.map(t=><li key={t}><CheckCircle2 size={18} aria-hidden="true"/>{t}</li>)}</ul></div>}
   {v.kit.length>0&&<div className="job-place-kit"><small>На месте</small>{v.kit.map(k=><span key={k}>{k}</span>)}</div>}
  </div>
 </section>;
}
