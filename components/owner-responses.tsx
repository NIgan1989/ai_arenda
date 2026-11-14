'use client';
import {Bot,Brush,ChevronRight} from 'lucide-react';
import {ApplicantPick} from './applicant-pick';
import {PropertyCover} from './property-cover';
import {jobPlace} from '../lib/job-place';
import './owner-responses.css';
type Row=Record<string,any>;
const when=(v:number)=>new Date(v*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+'\u00a0₸';

// «Заявки» of the owner: cleaners who answered his open cleanings, on top of the guests' requests. Each cleaning is one
// line (photo, when, fee) with its responses right under it, and «Назначить» / «Отклонить» on each response.
export function OwnerResponses({rows,approvals,role,busy,platformAdmin,onDecide,onOpen,autopilot}:{autopilot?:(job:Row,applications:Row[])=>string;rows:{job:Row;applications:Row[]}[];approvals:Row[];role:string;busy:boolean;platformAdmin?:boolean;onDecide:(body:Row)=>void;onOpen:(jobId:string)=>void}){
 if(!rows.length)return null;
 const total=rows.reduce((n,r)=>n+r.applications.length,0);
 return <section className="owner-responses" aria-label="Отклики исполнителей">
  <h2 className="owner-responses-title"><Brush size={18} aria-hidden="true"/>Отклики исполнителей<span>{total}</span></h2>
  {rows.map(({job,applications})=><article key={job.id} className="owner-response">
   <button type="button" className="owner-response-job" onClick={()=>onOpen(job.id)} aria-label={'Открыть уборку: '+job.title}>
    <span className="owner-response-thumb"><PropertyCover property={{photos:jobPlace(job).photos,title:job.title,rooms:job.rooms}} role={role}/></span>
    <span className="owner-response-text"><strong>{job.title}</strong><small>Уборка · {when(job.start)} · {money(job.fee)}</small></span>
    <ChevronRight size={18} aria-hidden="true"/>
   </button>
   {autopilot?.(job,applications)&&<p className="owner-response-autopilot"><Bot size={16} aria-hidden="true"/>{autopilot(job,applications)}</p>}
   <ApplicantPick applications={applications} approvals={approvals} role={role} busy={busy} platformAdmin={platformAdmin} onDecide={onDecide}/>
  </article>)}
 </section>;
}
