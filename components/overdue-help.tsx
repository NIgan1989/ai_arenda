'use client';
import {useEffect,useState} from 'react';
import {Clock3,Sparkles} from 'lucide-react';
import {Button} from './ui/button';
import {extendChoices,extendLabel,overdueNote} from '@/lib/overdue-text';
import './overdue-help.css';
type Row=Record<string,any>;
type Confirm={label:string;text:string;body:Row}|null;

// The way out of an overdue cleaning, right under the timer: what happened, what the AI administrator has done,
// and the buttons. A step that cannot be undone asks once inside the box, no extra card in the chat.
export function OverdueHelp({job,role,busy,onAction}:{job:Row;role:'owner'|'cleaner';busy:boolean;onAction:(body:Row)=>void}){
 const [t,setT]=useState(()=>Math.floor(Date.now()/1000)),[ask,setAsk]=useState<Confirm>(null);
 useEffect(()=>{const timer=setInterval(()=>setT(Math.floor(Date.now()/1000)),15000);return()=>clearInterval(timer);},[]);
 const note=overdueNote(job,role,t);if(!note)return null;
 const started=job.status==='in_progress',owner=role==='owner',v=job.version;
 const act=(body:Row)=>{setAsk(null);onAction({...body,expectedVersion:v});};
 return <section className="overdue-help" aria-label={note.title}>
  <div className="overdue-help-head"><Clock3 size={18}/><strong>{note.title}</strong></div>
  <p>{note.text}</p>
  <p className="overdue-help-ai"><Sparkles size={14}/>{note.ai}</p>
  {ask?<div className="overdue-help-confirm" role="group" aria-label={ask.label}><p>{ask.text}</p><div className="overdue-help-row"><Button disabled={busy} className="overdue-help-yes" onClick={()=>act(ask.body)}>{ask.label}</Button><Button variant="outline" disabled={busy} onClick={()=>setAsk(null)}>Назад</Button></div></div>:<>
   <div className="overdue-help-extend"><span>{owner?'Продлить срок':'Нужно ещё время'}</span><div className="overdue-help-chips">{extendChoices.map(m=><Button key={m} variant="outline" disabled={busy} onClick={()=>act({action:'extend',minutes:m})}>+{extendLabel(m)}</Button>)}</div></div>
   <div className="overdue-help-row">
    {owner&&started&&<Button disabled={busy} className="overdue-help-main" onClick={()=>setAsk({label:'Да, уборка выполнена',text:'Закрыть уборку без отчёта исполнителя? Жильё будет отмечено готовым, оплата исполнителю пройдёт как за принятую работу.',body:{action:'close',confirmed:true}})}>Уборка сделана, закрыть</Button>}
    <Button variant="outline" disabled={busy} onClick={()=>setAsk(owner?{label:'Найти другого',text:'Снять текущего исполнителя и вернуть уборку в поиск? Он получит уведомление, резерв оплаты вернётся.',body:{action:'release'}}:{label:'Да, отказаться',text:'Отказаться от задания? Уборка вернётся в поиск, владелец получит уведомление.',body:{action:'release'}})}>{owner?'Найти другого исполнителя':'Не смогу закончить'}</Button>
   </div>
   {owner&&<Button variant="ghost" disabled={busy} className="overdue-help-cancel" onClick={()=>setAsk({label:'Отменить уборку',text:'Отменить уборку совсем? Готовность жилья нужно будет отметить отдельно.',body:{action:'cancel',reason:'Уборка просрочена'}})}>Отменить уборку</Button>}
  </>}
 </section>;
}
