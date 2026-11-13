'use client';
import {Thinking} from './thinking';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowLeft,ArrowUp,Sparkles,Search} from 'lucide-react';
import {rolePages} from '../lib/access';
import {useSwipeDismiss} from './use-swipe-dismiss';
import {AdministratorPropertySearch} from './administrator-property-search';
import './task-sheet.css';
import {ReportContent} from './safety-controls';
import {AIDataPermission} from './ai-data-permission';
import {AdministratorCommands} from './administrator-commands';
type Row=Record<string,any>;
// Questions the administrator answers at once from the person's own data (see lib/administrator-process-read.ts).
const SUGGESTIONS:Record<string,string[]>={guest:['Мои брони сейчас','Что у меня сегодня?'],owner:['Что сегодня требует внимания?','Актуальные заявки','Статус уборок'],cleaner:['Есть уборки рядом на сегодня?','Мои задания сейчас','Что у меня завтра?']};
async function request(role:string,path:string,body?:Row){
 const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 const value=await r.json() as Row;if(!r.ok)throw Error(value.error||'Не удалось получить ответ. Попробуйте ещё раз.');return value;
}
export function AdministratorConversation({role,accountId,hint,onClose,onChanged,floating=false,children,initialRequest,onRequestConsumed,searchRequest=0,searchCity,onMapSearch}:{role:string;accountId:string;hint?:string;onClose:()=>void;onChanged:()=>Promise<unknown>;floating?:boolean;children?:ReactNode;initialRequest?:{id:string;text:string}|null;onRequestConsumed?:()=>void;searchRequest?:number;searchCity?:string;onMapSearch?:(filters:Record<string,string>)=>void}){
 const swipe=useSwipeDismiss(onClose),[searchExpanded,setSearchExpanded]=useState(false),searchPanel=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!searchRequest)return;setSearchExpanded(true);requestAnimationFrame(()=>searchPanel.current?.scrollIntoView({block:'start'}));},[searchRequest]);
 useEffect(()=>{if(searchExpanded){follow.current=false;requestAnimationFrame(()=>searchPanel.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));;}},[searchExpanded]);
 const query=useQuery<Row,Error>({queryKey:['administrator-conversation',accountId,role],queryFn:()=>request(role,'operations/administrator/conversation'),refetchInterval:5000,refetchIntervalInBackground:false,retry:1});
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(''),[error,setError]=useState(''),[older,setOlder]=useState<Row[]>([]),[action,setAction]=useState(''),[more,setMore]=useState<boolean|undefined>();
 const [viewportHeight,setViewportHeight]=useState<number|undefined>();
 useEffect(()=>{const viewport=window.visualViewport;const size=()=>setViewportHeight(window.innerWidth<=700?viewport?.height:undefined);size();viewport?.addEventListener('resize',size);window.addEventListener('resize',size);return()=>{viewport?.removeEventListener('resize',size);window.removeEventListener('resize',size);};},[]);
 const [permissionRefresh,setPermissionRefresh]=useState(0),[permissionNotice,setPermissionNotice]=useState(false);
 const [supportExpanded,setSupportExpanded]=useState(false),support=useRef<HTMLDetailsElement>(null),firstHistory=useRef(true);
 const draftKey='administrator-draft:'+accountId+':'+role;
 const [draftReady,setDraftReady]=useState(false);
 useEffect(()=>{try{setText(sessionStorage.getItem(draftKey)||'');}catch{}setDraftReady(true);},[draftKey]);
 useEffect(()=>{if(!draftReady)return;try{if(text)sessionStorage.setItem(draftKey,text);else sessionStorage.removeItem(draftKey);}catch{}},[text,draftReady,draftKey]);
 const dialog=useRef<HTMLDialogElement>(null),log=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),lock=useRef(false),follow=useRef(true),processedRequest=useRef('');
 const messages=Array.from(new Map([...older,...(query.data?.messages||[])].map(m=>[m.id,m])).values()).sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id));
 // Focus starts where the person will type; on a touch screen it goes to the log, so the keyboard does not cover the answer.
 useEffect(()=>{if(floating)dialog.current?.showModal();(window.matchMedia('(pointer: coarse)').matches?log.current:input.current)?.focus({preventScroll:true});return()=>dialog.current?.close();},[floating]);
 // The newest answer stays in view: the end of the log, or the start of the answer when it is taller than the log.
 const stick=()=>{const el=log.current;if(!el||!follow.current)return;const bubbles=el.querySelectorAll<HTMLElement>('.administrator-bubble'),last=bubbles[bubbles.length-1],end=el.scrollHeight-el.clientHeight;const top=last&&!last.classList.contains('mine')?last.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop-12:end;el.scrollTop=Math.max(0,Math.min(end,top));};
 useEffect(()=>{if(!query.data||!log.current)return;if(searchExpanded){firstHistory.current=false;return;}if(firstHistory.current&&supportExpanded&&support.current){firstHistory.current=false;follow.current=false;log.current.scrollTop=support.current.offsetTop-log.current.offsetTop;}else stick();},[query.data,older,pending]);
 // Parts that appear after the answer (the link to the section, the permission note) change the height of the log.
 useEffect(()=>{const el=log.current;if(!el)return;const resize=new ResizeObserver(stick),change=new MutationObserver(stick);resize.observe(el);change.observe(el,{childList:true,subtree:true});return()=>{resize.disconnect();change.disconnect();};},[]);
 async function deliver(value:string){value=value.trim();if(!value||lock.current)return;setSearchExpanded(false);setText(value);lock.current=true;setBusy(true);setPending(value);setError('');follow.current=true;
  try{const result=await request(role,'chat',{text:value,searchFilters:{city:searchCity||''}});setAction(result.action||'');setPermissionNotice(result.permissionRequired&&!result.search&&!result.fromAccount);setPermissionRefresh(n=>n+1);setText('');await query.refetch();await onChanged();}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);setPending('');input.current?.focus();}}
 async function send(e:FormEvent){e.preventDefault();await deliver(text);}
 useEffect(()=>{if(!initialRequest||processedRequest.current===initialRequest.id)return;processedRequest.current=initialRequest.id;onRequestConsumed?.();void deliver(initialRequest.text);},[initialRequest?.id]);
 async function earlier(){if(lock.current||!messages.length)return;lock.current=true;setBusy(true);setError('');follow.current=false;const el=log.current,oldHeight=el?.scrollHeight||0,oldTop=el?.scrollTop||0;
  try{const value=await request(role,'operations/administrator/history',{before:messages[0].id});setOlder(v=>[...value.messages,...v,...(query.data?.messages||[])]);setMore(value.hasOlder);requestAnimationFrame(()=>{if(el)el.scrollTop=oldTop+el.scrollHeight-oldHeight;});}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 async function decide(body:Row){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await request(role,'operations/commands',body);await query.refetch();await onChanged();}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 const target=({bookings:'bookings',overview:'overview',workspace:'map',profile:'account',properties:role==='owner'?'properties':'catalog',jobs:role==='owner'?'cleaning':'jobs'} as Record<string,string>)[action],page=rolePages[role as keyof typeof rolePages].find(p=>p.id===target);
 const content=<><div className="swipe-dismiss-edge" data-swipe-edge aria-hidden="true"/><header className="messenger-header" data-swipe-handle><div className="task-sheet-grip" aria-hidden="true"/><button type="button" onClick={onClose} aria-label="Закрыть чат администратора"><ArrowLeft size={21}/></button><span className={'ai-orb'+(busy?' thinking':'')} aria-hidden="true"><Sparkles size={18}/></span><span><strong>AI администратор</strong><small className="ai-status">{busy?'Думает…':'Онлайн · отвечает сразу'}</small></span></header>
 <div className="administrator-messages" ref={log} tabIndex={-1} role="log" aria-label="Переписка с AI администратором" aria-live="polite" aria-relevant="additions" onScroll={()=>{const el=log.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
 {(more??query.data?.hasOlder)&&<button className="history-more" disabled={busy} onClick={earlier}>Предыдущие сообщения</button>}
 {!query.data&&!query.error&&<p role="status"><Thinking size="sm" lead/>Открываю историю…</p>}
 {searchExpanded&&role==='guest'&&onMapSearch&&<div ref={searchPanel}><AdministratorPropertySearch city={searchCity} onShow={onMapSearch}/></div>}
 {query.data&&!messages.length&&!searchExpanded&&<div className="ai-hero"><span className="ai-orb large" aria-hidden="true"><Sparkles size={28}/></span><h2>Чем помочь?</h2><p>Брони, жильё, уборки и оплата. Отвечаю по вашим данным.</p></div>}
 {messages.map(m=><article key={m.id} className={'administrator-bubble '+(m.sender==='user'?'mine':'')}><p>{m.body}</p>{m.search&&onMapSearch&&<button type="button" className="administrator-action" onClick={()=>onMapSearch(m.search.filters)}>Повторить поиск на карте · {m.search.availabilityChecked?'с датами':'без дат'}</button>}{m.sender==='assistant'&&<ReportContent role={role} kind="ai" targetId={String(m.id)}/>}<time>{new Date(m.created_at*1000).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).replace(' в ',', ')}</time></article>)}
 {pending&&<article className="administrator-bubble mine pending"><p>{pending}</p><small>Отправляю…</small></article>}
 {busy&&<p className="administrator-typing" role="status"><span className="ai-dots" aria-hidden="true"><Thinking/></span><span className="sr-only">Администратор думает</span></p>}
 {page&&!(action==='properties'&&role==='guest')&&<a className="administrator-action" href={'/workspace/'+role+'/'+page.id}>{page.title} →</a>}{children&&<details className="administrator-process-support" open={supportExpanded} onToggle={e=>setSupportExpanded(e.currentTarget.open)} ref={support}><summary>Рекомендации и согласования</summary>{children}</details>}<AdministratorCommands commands={query.data?.commands||[]} busy={busy} onDecide={decide}/></div>
 {permissionNotice&&<p className="administrator-permission-notice" role="status">Ответ дан по правилам сервиса. Для свободного ответа можно отдельно разрешить передачу данных ниже и отправить запрос снова.</p>}<AIDataPermission role={role} refresh={permissionRefresh}/>
 {(error||query.error)&&<p className="messenger-error" role="alert">{error||query.error?.message}<button type="button" onClick={()=>void query.refetch()}>Обновить</button></p>}
 {!busy&&!text.trim()&&<div className="ai-suggestions" role="group" aria-label="Быстрые вопросы">{role==='guest'&&onMapSearch&&<button type="button" aria-expanded={searchExpanded} onClick={()=>setSearchExpanded(!searchExpanded)}><Search size={14} aria-hidden="true"/>Подобрать жильё</button>}{[...(hint?[hint]:[]),...(SUGGESTIONS[role]||[])].filter((v,i,a)=>a.indexOf(v)===i).slice(0,3).map(q=><button type="button" key={q} onClick={()=>void deliver(q)}>{q}</button>)}</div>}<form className="messenger-composer" onSubmit={send}><textarea ref={input} rows={1} maxLength={2000} inputMode="text" enterKeyHint="send" autoComplete="off" aria-label="Сообщение администратору" placeholder="Спросите что угодно…" value={text} onChange={e=>setText(e.target.value)} readOnly={busy} aria-busy={busy} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(e);}}}/><button aria-label="Отправить администратору" disabled={busy||!text.trim()}><ArrowUp size={21}/></button></form></>;
 return floating?<dialog {...swipe} ref={dialog} className="administrator-dialog administrator-conversation" style={viewportHeight?{height:viewportHeight}:undefined} aria-label="AI администратор" onCancel={e=>{e.preventDefault();onClose();}}>{content}</dialog>:<section {...swipe} className="administrator-conversation" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} style={viewportHeight?{height:viewportHeight}:undefined} aria-label="AI администратор">{content}</section>;
}
