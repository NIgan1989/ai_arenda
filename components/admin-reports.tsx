'use client';
import {useState} from 'react';
import {Sparkles,CheckCircle2,Flag,MessageSquareText,Bot,EyeOff} from 'lucide-react';
import {Button} from './ui/button';
import './admin-reviews.css';

type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
const when=(t:number)=>new Date(t*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const roles:Row={guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'};

// Жалобы: the AI administrator hides messages that break the rules on their face (contacts, payment
// around the service, obscene words). The administrator decides the rest: open the message (an audited
// look), hide it or close the report, and can bring back anything the AI hid.
export function AdminReports({data,busy,save}:{data:Row;busy:boolean;save:Save}){
 const queue:Row[]=data.queue||[],hidden:Row[]=data.hidden||[];
 return <div className="admin-reviews">
  <section className="reviews-ai"><div className="reviews-ai-copy"><span className="reviews-ai-badge"><Sparkles size={16}/>ИИ-администратор</span><h2>Убирает явные нарушения сам</h2><p>Сообщения с телефонами, ссылками, просьбой оплатить мимо сервиса или матом скрывает сразу. Оригинал сохраняется, вернуть можно одной кнопкой.</p></div>
   <div className="reviews-ai-side"><dl className="reviews-stats"><div><dt>Ждут вас</dt><dd>{queue.length}</dd></div><div><dt>ИИ скрыл за неделю</dt><dd>{hidden.length}</dd></div></dl></div></section>
  <section className="reviews-group"><header><h2>Нужно ваше решение</h2><span>{queue.length}</span></header>
   {queue.length===0?<div className="reviews-empty"><CheckCircle2 size={24}/><p>Новых жалоб нет.</p></div>:<div className="reviews-list">{queue.map(r=><ReportCard key={r.id+':'+(r.version||0)} r={r} busy={busy} save={save}/>)}</div>}
  </section>
  {hidden.length>0&&<section className="reviews-group"><header><h2>Скрыто ИИ за неделю</h2><span>{hidden.length}</span></header>
   <ul className="reviews-done">{hidden.map(r=><li key={r.id}><span className="reviews-role"><EyeOff size={16}/></span><span><strong>{String(r.resolution||'Сообщение скрыто').replace(/^Скрыто ИИ-администратором:\s*/,'').replace(/\.\s*Администратор может восстановить\.?$/,'').replace(/^./,(c:string)=>c.toUpperCase())}</strong><small>Жалоба: {r.reason}</small></span>{r.hidden?<Button variant="outline" disabled={busy} onClick={async()=>{const seen=await save('reports/action',{action:'inspect',reportId:r.id,reason:'Проверка решения ИИ'});if(seen)await save('reports/action',{action:'moderate',reportId:r.id,decision:'restore',expectedVersion:seen.material.version,reason:'Администратор вернул сообщение'});}}>Вернуть</Button>:<span className="reviews-when">Возвращено</span>}</li>)}</ul>
  </section>}
 </div>;
}

function ReportCard({r,busy,save}:{r:Row;busy:boolean;save:Save}){
 const [material,setMaterial]=useState<Row|null>(null);
 const open=async()=>{const seen=await save('reports/action',{action:'inspect',reportId:r.id,reason:'Разбор жалобы'});if(seen)setMaterial(seen.material);};
 const hide=async()=>{let version=material?.version;if(version===undefined){const seen=await save('reports/action',{action:'inspect',reportId:r.id,reason:'Разбор жалобы'});if(!seen)return;version=seen.material.version;}
  if(await save('reports/action',{action:'moderate',reportId:r.id,decision:'hide',expectedVersion:version,reason:'Нарушение подтверждено администратором'}))await save('reports/action',{action:'review',id:r.id,status:'resolved',resolution:'Сообщение скрыто администратором.'});};
 const dismiss=()=>save('reports/action',{action:'review',id:r.id,status:'resolved',resolution:'Нарушения нет, сообщение оставлено.'});
 return <article className="review-card">
  <div className="review-head"><span className="reviews-role">{r.target_kind==='ai'?<Bot size={18}/>:<Flag size={18}/>}</span><div><span className="review-kind">{roles[r.role]||'Участник'} пожаловался · {when(r.created_at)}</span><h3>{r.target_kind==='ai'?'Ответ ИИ-администратора':'Сообщение в чате'}</h3><p>Причина: {r.reason}</p></div></div>
  <p className="review-verdict"><Sparkles size={15}/>{r.ai_note||'ИИ ещё не проверял'}</p>
  {material&&<p className="issue-text"><MessageSquareText size={16}/>{material.body}</p>}
  <div className="review-actions"><Button variant="outline" disabled={busy} onClick={dismiss}>Нарушения нет</Button>{!material&&<Button variant="outline" disabled={busy} onClick={open}>Открыть</Button>}<Button variant="destructive" disabled={busy} onClick={hide}>Скрыть</Button></div>
 </article>;
}
