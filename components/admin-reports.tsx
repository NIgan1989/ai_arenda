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
 const queue:Row[]=data.queue||[],waiting=Number(data.queueTotal??queue.length),hidden:Row[]=data.hidden||[];
 return <div className="admin-reviews">
  <section className="reviews-ai"><div className="reviews-ai-copy"><span className="reviews-ai-badge"><Sparkles size={16}/>ИИ-администратор</span><h2>Убирает явные нарушения сам</h2><p>Сообщения с телефонами, ссылками, просьбой оплатить мимо сервиса или матом скрывает сразу. Оригинал сохраняется, вернуть можно одной кнопкой.</p></div>
   <div className="reviews-ai-side"><dl className="reviews-stats"><div><dt>Ждут вас</dt><dd>{waiting}</dd></div><div><dt>ИИ скрыл за неделю</dt><dd>{hidden.length}</dd></div></dl></div></section>
  <section className="reviews-group"><header><h2>Нужно ваше решение</h2><span>{waiting}</span></header>
   {queue.length===0?<div className="reviews-empty"><CheckCircle2 size={24}/><p>Новых жалоб нет.</p></div>:<div className="reviews-list">{queue.map(r=><ReportCard key={r.id+':'+(r.version||0)} r={r} busy={busy} save={save}/>)}</div>}
  </section>
  {hidden.length>0&&<section className="reviews-group"><header><h2>Скрыто ИИ за неделю</h2><span>{hidden.length}</span></header>
   <ul className="reviews-done">{hidden.map(r=><li key={r.id}><span className="reviews-role"><EyeOff size={16}/></span><span><strong>{!r.hidden?'Сообщение возвращено':String(r.resolution||'Сообщение скрыто').replace(/^Скрыто ИИ-администратором:\s*/,'').replace(/\.\s*Администратор может восстановить\.?$/,'').replace(/^./,(c:string)=>c.toUpperCase())}</strong><small>Жалоба: {r.reason}</small></span>{r.hidden?<Button variant="outline" disabled={busy} onClick={async()=>{const seen=await save('reports/action',{action:'inspect',reportId:r.id,reason:'Проверка решения ИИ'});if(seen)await save('reports/action',{action:'moderate',reportId:r.id,decision:'restore',expectedVersion:seen.material.version,reason:'Администратор вернул сообщение'});}}>Вернуть</Button>:<span className="reviews-when">Возвращено</span>}</li>)}</ul>
  </section>}
  <Objections list={data.objections||[]} busy={busy} save={save}/>
 </div>;
}

// «Не согласен с оценкой»: a participant objects to the reliability rating (lib/reliability-objection.ts).
// The answer goes to the participant as a notice; it is due within three working days.
function Objections({list,busy,save}:{list:Row[];busy:boolean;save:Save}){
 const open=list.filter(o=>o.status==='open'),done=list.filter(o=>o.status!=='open');
 return <section className="reviews-group"><header><h2>Возражения на оценку надёжности</h2><span>{open.length}</span></header>
  {open.length===0?<div className="reviews-empty"><CheckCircle2 size={24}/><p>Открытых возражений нет.</p></div>:<div className="reviews-list">{open.map(o=><ObjectionCard key={o.id} o={o} busy={busy} save={save}/>)}</div>}
  {done.length>0&&<ul className="reviews-done">{done.map(o=><li key={o.id}><span className="reviews-role"><CheckCircle2 size={16}/></span><span><strong>{o.name||'Участник'}: {o.answer}</strong><small>Возражение: {o.body}{o.cancelled?' · отменено отметок: '+o.cancelled:''}</small></span></li>)}</ul>}
 </section>;
}
// The card shows the rating and the episodes it is made of (audit 2026-11-22): an episode found wrong is ticked and
// cancelled with the answer, the rating and the risk of the guest's waiting requests are counted again at once.
function ObjectionCard({o,busy,save}:{o:Row;busy:boolean;save:Save}){
 const [answer,setAnswer]=useState(''),[cancel,setCancel]=useState<string[]>([]);
 const episodes:Row[]=o.episodes||[],key=(e:Row)=>e.kind+':'+e.id;
 const toggle=(k:string)=>setCancel(v=>v.includes(k)?v.filter(x=>x!==k):[...v,k]);
 return <article className="review-card">
  <div className="review-head"><span className="reviews-role"><Flag size={18}/></span><div><span className="review-kind">{roles[o.role]||'Участник'} · {when(o.created_at)}</span><h3>{o.name||'Участник'}</h3><p>{o.late?'Срок ответа прошёл: ':'Ответить до '}{when(o.due_at)}</p></div></div>
  <p className="issue-text"><MessageSquareText size={16}/>{o.body}</p>
  {o.reliability&&<p className="review-verdict">Оценка сейчас: {o.reliability.score?String(o.reliability.score).replace('.',','):'нет'} · {(o.reliability.facts||[]).join(', ')||o.reliability.label}</p>}
  {episodes.length>0?<fieldset style={{display:'grid',gap:6,border:0,padding:0,margin:0}}><legend style={{fontWeight:600,marginBottom:4}}>Что снижает оценку. Отметьте ошибочное, чтобы отменить вместе с ответом</legend>
   {episodes.map(e=><label key={key(e)} style={{display:'flex',gap:8,alignItems:'flex-start',opacity:e.voided?.6:1}}><input type="checkbox" disabled={busy||e.voided} checked={e.voided||cancel.includes(key(e))} onChange={()=>toggle(key(e))}/><span><strong>{e.note}</strong><small style={{display:'block'}}>{e.title} · {when(e.at)}{e.voided?' · уже отменено':''}</small></span></label>)}
  </fieldset>:<p className="review-verdict">Отметок, которые снижают оценку, нет.</p>}
  <textarea aria-label="Ответ участнику" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={2000} rows={3} placeholder="Что проверили и что решили" style={{width:'100%'}}/>
  <div className="review-actions"><Button disabled={busy||answer.trim().length<10} onClick={async()=>{if(await save('objections/answer',{id:o.id,answer,cancel})){setAnswer('');setCancel([]);}}}>{cancel.length?'Ответить и отменить отмеченное: '+cancel.length:'Ответить'}</Button></div>
 </article>;
}

function ReportCard({r,busy,save}:{r:Row;busy:boolean;save:Save}){
 const [material,setMaterial]=useState<Row|null>(null);
 const open=async()=>{const seen=await save('reports/action',{action:'inspect',reportId:r.id,reason:'Разбор жалобы'});if(seen)setMaterial(seen.material);};
 const hide=async()=>{let version=material?.version;if(version===undefined){const seen=await save('reports/action',{action:'inspect',reportId:r.id,reason:'Разбор жалобы'});if(!seen)return;version=seen.material.version;}
  if(await save('reports/action',{action:'moderate',reportId:r.id,decision:'hide',expectedVersion:version,reason:'Нарушение подтверждено администратором'}))await save('reports/action',{action:'review',id:r.id,status:'resolved',resolution:'Сообщение скрыто администратором.'});};
 const dismiss=()=>save('reports/action',{action:'review',id:r.id,status:'resolved',resolution:'Нарушения нет, сообщение оставлено.'});
 return <article className="review-card">
  <div className="review-head"><span className="reviews-role">{r.target_kind==='ai'?<Bot size={18}/>:<Flag size={18}/>}</span><div><span className="review-kind">{roles[r.role]||'Участник'} пожаловался · {when(r.created_at)}</span><h3>{r.target_kind==='ai'?'Ответ ИИ-администратора':'Сообщение в чате'}</h3><p>Причина: {r.reason}</p></div></div>
  <p className="review-verdict"><Sparkles size={15}/>{r.ai_note?String(r.ai_note).replace(/^./,(c:string)=>c.toUpperCase()):'ИИ ещё не проверял'}</p>
  {material&&<p className="issue-text"><MessageSquareText size={16}/>{material.body}</p>}
  <div className="review-actions"><Button variant="outline" disabled={busy} onClick={dismiss}>Нарушения нет</Button>{!material&&<Button variant="outline" disabled={busy} onClick={open}>Открыть</Button>}<Button variant="destructive" disabled={busy} onClick={hide}>Скрыть</Button></div>
 </article>;
}
