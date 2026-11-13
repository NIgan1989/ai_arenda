'use client';
import {useEffect,useRef,useState} from 'react';
import {Sparkles,CheckCircle2,AlertTriangle,Clock3,House,ChevronDown,MessageSquareText} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import './admin-reviews.css';

type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
const when=(t:number)=>new Date(t*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const span=(s:number)=>{const m=Math.max(1,Math.round(Math.abs(s)/60));return m<60?m+' мин':m<1440?Math.round(m/60)+' ч':Math.round(m/1440)+' дн';};
const priorities:Row={urgent:'Срочно',high:'Повышенная',normal:'Обычная'};
const roles:Row={guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'};
const actions:Row={triage:'Срочность и срок',claim:'Взято в работу',release:'Возвращено в очередь',note:'Комментарий',resolve:'Решение',reopen:'Открыто повторно',takeover:'Смена ответственного',source_resolved:'Решение участника'};

// Обращения: the AI administrator sorts every issue, sets the answer time and reminds the other side.
// The administrator sees first what needs a person: urgent issues, late ones and the ones they took.
export function AdminIssues({state,busy,save}:{state:Row;busy:boolean;save:Save}){
 const [now,setNow]=useState(()=>Math.floor(Date.now()/1000)),tickets:Row[]=state.tickets||[],me=state.currentUserId;
 const open=tickets.filter(t=>t.status!=='resolved'),done=tickets.filter(t=>t.status==='resolved');
 const needs=(t:Row)=>t.priority==='urgent'||t.deadline<=now||t.assigned_to===me;
 const yours=open.filter(needs),watched=open.filter(t=>!needs(t));
 useEffect(()=>{const id=setInterval(()=>setNow(Math.floor(Date.now()/1000)),60000);return()=>clearInterval(id);},[]);
 const [showWatched,setShowWatched]=useState(false),[showDone,setShowDone]=useState(false);
 return <div className="admin-reviews">
  <section className="reviews-ai">
   <div className="reviews-ai-copy"><span className="reviews-ai-badge"><Sparkles size={16}/>ИИ-администратор</span><h2>Следит за обращениями сам</h2><p>Определяет тему и срочность, ставит срок ответа и напоминает второй стороне. Вам пишет только о срочном и о том, что не решили вовремя.</p></div>
   <div className="reviews-ai-side"><dl className="reviews-stats"><div><dt>Ждут вас</dt><dd>{yours.length}</dd></div><div><dt>ИИ ведёт</dt><dd>{watched.length}</dd></div><div><dt>Решено</dt><dd>{done.length}</dd></div></dl></div>
  </section>
  <section className="reviews-group"><header><h2>Нужно ваше внимание</h2><span>{yours.length}</span></header>
   {yours.length===0?<div className="reviews-empty"><CheckCircle2 size={24}/><p>Срочных и просроченных обращений нет.</p></div>:<div className="reviews-list">{yours.map(t=><IssueCard key={t.issue_id+':'+t.version} t={t} me={me} now={now} busy={busy} save={save}/>)}</div>}
  </section>
  {watched.length>0&&<section className="reviews-group"><header><h2>ИИ ведёт</h2><span>{watched.length}</span><button type="button" className="reviews-toggle" onClick={()=>setShowWatched(v=>!v)}>{showWatched?'Скрыть':'Показать'}</button></header>
   <p className="reviews-note">Стороны решают сами, ИИ напомнит и позовёт вас, если срок пройдёт.</p>
   {showWatched&&<div className="reviews-list">{watched.map(t=><IssueCard key={t.issue_id+':'+t.version} t={t} me={me} now={now} busy={busy} save={save}/>)}</div>}
  </section>}
  {done.length>0&&<section className="reviews-group"><header><h2>Решены</h2><span>{done.length}</span><button type="button" className="reviews-toggle" onClick={()=>setShowDone(v=>!v)}>{showDone?'Скрыть':'Показать'}</button></header>
   {showDone&&<ul className="reviews-done">{done.map(t=><li key={t.issue_id}><span className="reviews-role"><House size={16}/></span><span><strong>{t.property_title}</strong><small>{t.resolution||t.description}</small></span><span className="reviews-when">Решено · {when(t.resolved_at||t.updated_at)}</span></li>)}</ul>}
  </section>}
 </div>;
}

function IssueCard({t,me,now,busy,save}:{t:Row;me:string;now:number;busy:boolean;save:Save}){
 const key=useRef(crypto.randomUUID()),[mode,setMode]=useState<''|'resolve'|'note'>(''),[text,setText]=useState(''),[internal,setInternal]=useState(false);
 const ai=(t.history||[]).find((h:Row)=>h.actor_id==='ai-administrator'),mine=t.assigned_to===me,late=t.deadline<=now;
 const send=async(action:string,version:number,extra:Row={})=>save('governance/ticket',{issueId:t.issue_id,expectedVersion:version,action,requestKey:key.current+':'+action,...extra});
 async function submit(){
  const body=text.trim();if(!body)return;
  let version=t.version;
  if(mode==='resolve'&&!mine){const claimed=await send('claim',version);if(!claimed)return;version=claimed.version;}
  const r=await send(mode,version,{note:body,confirmed:true,visibility:mode==='note'&&internal?'operators':'participants'});
  if(r){key.current=crypto.randomUUID();setMode('');setText('');}
 }
 return <article className={'review-card'+(t.priority==='urgent'||late?' is-risk':'')}>
  <div className="review-head"><span className="reviews-role"><House size={18}/></span><div><span className="review-kind">{roles[t.opened_role]||'Участник'} · {when(t.created_at)}</span><h3>{t.property_title}</h3><p>{t.assigned_to?mine?'Вы ведёте это обращение':'Ведёт другой оператор':'Ведёт ИИ-администратор'}</p></div><span className={'issue-priority is-'+t.priority}>{priorities[t.priority]}</span></div>
  <p className="issue-text"><MessageSquareText size={16}/>{t.description}</p>
  {ai&&<p className="review-verdict"><Sparkles size={15}/>{String(ai.body).replace(/^ИИ-администратор:\s*/,'').replace(/^./,(c:string)=>c.toUpperCase())}</p>}
  <p className={'issue-deadline'+(late?' is-late':'')}>{late?<AlertTriangle size={15}/>:<Clock3 size={15}/>}{late?'Срок ответа прошёл '+span(now-t.deadline)+' назад':'Ответ нужен до '+when(t.deadline)+' · осталось '+span(t.deadline-now)}</p>
  {t.history?.length>0&&<details className="issue-history"><summary>История ({t.history.length})<ChevronDown size={15}/></summary><ul>{t.history.map((h:Row)=><li key={h.id}><small>{when(h.created_at)} · {actions[h.action]||'Событие'}{h.visibility==='operators'?' · только операторам':''}</small><p>{h.body}</p></li>)}</ul></details>}
  {mode?<div className="review-reject"><label>{mode==='resolve'?'Решение, его увидят обе стороны':'Сообщение'}<Textarea value={text} onChange={e=>setText(e.target.value)} maxLength={1500} rows={3} autoFocus/></label>{mode==='note'&&<label className="issue-internal"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/>Только для операторов</label>}<div className="review-actions"><Button variant="outline" disabled={busy} onClick={()=>{setMode('');setText('');}}>Отмена</Button><Button disabled={busy||!text.trim()} onClick={submit}>{mode==='resolve'?'Закрыть обращение':'Отправить'}</Button></div></div>
  :<div className="review-actions">{t.status==='resolved'?<Button variant="outline" disabled={busy} onClick={()=>setMode('note')}>Комментарий</Button>:<><Button variant="outline" disabled={busy} onClick={()=>setMode('note')}>Написать</Button>{!t.assigned_to&&<Button variant="outline" disabled={busy} onClick={()=>send('claim',t.version)}>Взять себе</Button>}<Button disabled={busy||(!!t.assigned_to&&!mine)} onClick={()=>setMode('resolve')}>Закрыть</Button></>}</div>}
 </article>;
}
