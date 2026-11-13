'use client';
import {Check,X,UserRound} from 'lucide-react';
import {Button} from './ui/button';
import {Photo} from './media';
import {StatusBadge} from './property-listing';
import './applicant-pick.css';
type Row=Record<string,any>;
// One line about a cleaner: photo, name, where, and the profile facts as short tags. Used for the assigned cleaner
// and for every response, so the owner sees the same row before and after choosing.
export function WorkerRow({worker:w,role,label}:{worker:Row;role:string;label?:string}){
 const tags=[w.experience&&'Опыт: '+w.experience,w.availability&&'График: '+w.availability].filter(Boolean) as string[];
 return <div className="worker-row">
  <div className="worker-row-who"><Photo id={w.avatar_id} role={role} alt={'Фото: '+(w.name||'исполнитель')} name={w.name} avatar/><div>{label&&<small className="worker-row-label">{label}</small>}<strong>{w.name||'Исполнитель'}</strong><small>{[w.city,w.districts].filter(Boolean).join(' · ')||'Город не указан'}</small></div></div>
  {(tags.length>0||!label&&w.display_status)&&<div className="worker-row-tags">{!label&&w.display_status&&<StatusBadge status={w.display_status}/>}{tags.map(t=><span key={t}>{t}</span>)}</div>}
 </div>;
}
// The owner's decision on an open cleaning, said once and placed right under the step: each response is a cleaner row
// with «Назначить» and «Отклонить» on it. The answer goes to the same server check as the approval card, without
// opening a second card further down the sheet.
export function ApplicantPick({applications,approvals,role,busy,onDecide}:{applications:Row[];approvals:Row[];role:string;busy:boolean;onDecide:(body:Row)=>void}){
 if(!applications.length)return <section className="applicant-pick is-empty" aria-label="Отклики исполнителей"><UserRound size={18}/><p><strong>Откликов пока нет</strong><small>Исполнитель появится здесь, как только откликнется. Назначить можно одной кнопкой.</small></p></section>;
 return <section className="applicant-pick" aria-label="Отклики исполнителей">
  <h3>{applications.length===1?'Откликнулся исполнитель':'Отклики'}{applications.length>1&&<span>{applications.length}</span>}</h3>
  {applications.map(a=>{const card=approvals.find(c=>c.id==='application:'+a.id),off=busy||!card,decide=(action:string)=>card&&onDecide({id:card.id,revision:card.revision,action});
   return <article key={a.id} className="applicant-option"><WorkerRow worker={{...a,...(a.worker||{}),experience:a.worker?.experience||a.experience}} role={role}/>
    <div className="applicant-decide"><Button disabled={off} className="applicant-accept" onClick={()=>decide('accept')}><Check size={17}/>Назначить</Button><Button variant="outline" disabled={off} className="applicant-reject" onClick={()=>decide('reject')} aria-label={'Отклонить отклик: '+(a.worker?.name||a.name||'исполнитель')}><X size={17}/>Отклонить</Button></div>
    {!card&&<small className="applicant-closed">Срок ответа истёк. Обновите данные.</small>}
   </article>;})}
  <small className="applicant-note">Анкету заполняет исполнитель, платформа её пока не проверяет.</small>
 </section>;
}
