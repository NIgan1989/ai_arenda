'use client';
import {Thinking} from './thinking';
import {AccountDeletion,DeletionReview} from './account-deletion';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import './safety-controls.css';
import './account-list.css';
import {BadgeCheck,ChevronRight,Clock,FileText,Flag,KeyRound,Monitor,ShieldAlert,Smartphone,Sparkles,Trash2} from 'lucide-react';
type Row=Record<string,any>;
async function safety(role:string,action='',body?:Row){const r=await fetch('/api/operations/safety'+(action?'/'+action:''),{method:body?'POST':'GET',headers:{'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const value=await r.json() as Row;if(!r.ok)throw Object.assign(Error(value.error||'Не удалось подтвердить действие.'),{status:r.status});return value;}
export function ReportContent({role,kind,targetId,roomId}:{role:string;kind:'ai'|'message';targetId:string;roomId?:string}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 async function send(e:FormEvent){e.preventDefault();setBusy(true);try{const r=await safety(role,'report',{kind,targetId,roomId,reason});setStatus(r.message);setOpen(false);setReason('');}catch(e:any){setStatus(e.message);}finally{setBusy(false);}}
 return <div className="content-report">{!open?<button type="button" onClick={()=>setOpen(true)} aria-label={'Пожаловаться на '+(kind==='ai'?'ответ администратора':'сообщение')}>Пожаловаться</button>:<form onSubmit={send}><p>Оператор сможет проверить конкретное сообщение и его вложение. Доступ к материалам жалобы записывается в журнал.</p><label>Что не так?<Textarea required minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Опишите проблему, не указывая пароли и коды доступа"/></label><div><Button disabled={busy}>Отправить жалобу</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Отмена</Button></div></form>}{status&&<p role="status">{status}</p>}</div>;
}
export function ChatBlock({role,roomId}:{role:string;roomId:string}){
 const [blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>{let live=true;fetch('/api/operations/discussion/blocks',{headers:{'X-Workspace-Role':role},cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return await r.json() as Row;}).then(s=>{if(live)setBlocked(s.blocks.some((v:Row)=>v.room_id===roomId));}).catch(()=>{});return()=>{live=false;};},[role,roomId]);
 async function toggle(){setBusy(true);try{const r=await safety(role,'block',{roomId,blocked:!blocked});setBlocked(!blocked);setStatus(r.message);}catch(e:any){setStatus(e.message);}finally{setBusy(false);}}
 return <details className="chat-safety"><summary>Безопасность переписки</summary><p>Блокировка останавливает новые сообщения в этом чате с обеих сторон. История, бронь, расчёты и обращения по процессу сохраняются.</p><Button variant="outline" type="button" disabled={busy} onClick={toggle}>{blocked?'Снять мою блокировку':'Заблокировать переписку'}</Button>{status&&<p role="status">{status}</p>}</details>;
}
// «Данные и безопасность»: a short list, each row opens its own screen. Plain words for the participant;
// the operator's queues stay in the service management, and only an administrator sees the deletion requests here.
export type SafetyPage=''|'devices'|'ai'|'delete'|'reports'|'requests';
export const safetyTitles:Record<Exclude<SafetyPage,''>,string>={devices:'Вход и устройства',ai:'ИИ-помощник',delete:'Удаление аккаунта',reports:'Мои жалобы',requests:'Запросы на удаление'};
const day=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
const devices=(n:number)=>n+' '+(n%10===1&&n%100!==11?'устройство':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'устройства':'устройств');
export function AccountSafety({role,admin=false,page='',go}:{role:string;admin?:boolean;page?:SafetyPage;go:(page:SafetyPage)=>void}){
 const [state,setState]=useState<Row|null>(null),[sessions,setSessions]=useState<Row[]|null>(null),[permission,setPermission]=useState<Row|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const alive=useRef(false),sequence=useRef(0),activeRole=useRef(role);activeRole.current=role;
 const current=(id:number,requestedRole:string)=>alive.current&&sequence.current===id&&activeRole.current===requestedRole;
 async function call(path:string,body?:Row){const r=await fetch(path,{method:body?'POST':'GET',headers:{'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const value=await r.json() as Row;if(!r.ok)throw Object.assign(Error(value.error||'Не получилось. Попробуйте ещё раз.'),{status:r.status});return value;}
 async function load(){const id=++sequence.current,requestedRole=role;setLoading(true);setLoadError('');try{const [value,list,ai]=await Promise.all([safety(requestedRole),call('/api/sessions').catch(()=>null),call('/api/operations/ai-data-permission').catch(()=>null)]);if(current(id,requestedRole)){setState(value);setSessions(Array.isArray(list?.sessions)?list!.sessions:null);setPermission(ai?.permission||null);}}catch(e:any){if(current(id,requestedRole)){setState(null);setLoadError(e?.status?e.message:'Нет связи. Проверьте интернет и попробуйте ещё раз.');}}finally{if(current(id,requestedRole))setLoading(false);}}
 useEffect(()=>{alive.current=true;setState(null);setConfirmed(false);setStatus('');setBusy(false);void load();return()=>{alive.current=false;sequence.current++;};},[role]);
 useEffect(()=>{setStatus('');setConfirmed(false);},[page]);
 async function act(run:()=>Promise<Row>,reload=true){const requestedRole=role;setBusy(true);setStatus('');try{const r=await run();if(!alive.current||activeRole.current!==requestedRole)return r;setStatus(r.message||'Готово.');if(reload)await load();return r;}catch(e:any){if(alive.current&&activeRole.current===requestedRole)setStatus(e?.status?e.message:'Нет связи. Попробуйте ещё раз.');}finally{if(alive.current&&activeRole.current===requestedRole)setBusy(false);}}
 const revoke=(body:Row)=>act(async()=>{const r=await call('/api/sessions',{...body,confirmed:true});if(r.currentRevoked)window.location.assign('/signin');return r;});
 const choose=(allowed:boolean)=>permission&&act(()=>call('/api/operations/ai-data-permission',{allowed,policyVersion:permission.policyVersion,expectedVersion:permission.version}));
 const open=(Icon:any,title:string,to:SafetyPage,value?:ReactNode)=><button type="button" className="acct-row" onClick={()=>go(to)}><Icon size={20}/><span>{title}</span>{value!==undefined&&value!==''&&<em>{value}</em>}<ChevronRight size={16}/></button>;
 const note=<>{status&&<p className="acct-lead" role="status">{status}</p>}</>;
 if(!state)return loading?<p className="acct-lead" role="status"><Thinking size="sm" lead/>Загружаем…</p>:<div className="acct-stack"><p className="acct-lead" role="alert">{loadError}</p><button type="button" className="acct-wide" onClick={()=>void load()}>Повторить</button></div>;
 const requested=state.deletion?.status==='requested',details=state.deletionDetails||{},reports:Row[]=state.reports||[],deletions:Row[]=state.deletions||[];
 const aiValue=!permission?'':permission.allowed?'Включён':permission.decided?'Выключен':'Не выбрано';
 if(page==='devices'){const others=(sessions||[]).some(v=>!v.current);return <div className="acct-stack">
  <p className="acct-lead">Вы входите по номеру телефона и паролю. Забыли пароль — нажмите «Забыли пароль?» на экране входа и введите резервный код.</p>
  <section className="acct-group">{(sessions||[]).map(v=>{const Icon=v.kind==='mobile'?Smartphone:Monitor;return <div key={v.kind+v.id} className="acct-row acct-static"><Icon size={20}/><span>{v.kind==='mobile'?'Приложение':'Браузер'}<small>{v.current?'Это устройство':'Вход действует до '+day(v.expires_at)}</small></span>{!v.current&&<button type="button" className="acct-pill" disabled={busy} onClick={()=>void revoke({action:'one',kind:v.kind,id:v.id})}>Выйти</button>}</div>;})}{sessions&&!sessions.length&&<p className="acct-row acct-static">Других входов нет.</p>}</section>
  {others&&<button type="button" className="acct-wide" disabled={busy} onClick={()=>void revoke({action:'others'})}>Выйти на всех других устройствах</button>}<section className="acct-group"><a className="acct-row" href={'/workspace/'+role+'/operations?tab=reviews'}><BadgeCheck size={20}/><span>{role==='cleaner'?'Проверка исполнителя':role==='owner'?'Проверка владельца и жилья':'Подтверждение номера'}</span><ChevronRight size={16}/></a></section>{note}</div>;}
 if(page==='ai')return <div className="acct-stack">
  <section className="acct-group"><label className="acct-row"><Sparkles size={20}/><span>Разрешить ИИ видеть мои данные<small>{aiValue==='Не выбрано'?'Вы ещё не выбрали':aiValue==='Включён'?'ИИ отвечает с учётом ваших броней и жилья':'ИИ отвечает только по правилам сервиса'}</small></span><input type="checkbox" role="switch" className="acct-switch" checked={!!permission?.allowed} disabled={busy||!permission} onChange={e=>void choose(e.target.checked)}/></label></section>
  <p className="acct-lead">Так ИИ-администратор отвечает точнее: он видит ваш вопрос, несколько последних сообщений и данные вашей роли. Фото, личные чаты и коды от замков он не видит.</p>
  <p className="acct-lead">Ответы готовит внешний сервис OpenAI, данные могут обрабатываться за рубежом. Выключить можно в любой момент. Без разрешения ИИ всё равно ищет жильё и подсказывает по правилам.</p>
  {permission&&!permission.decided&&<button type="button" className="acct-wide" disabled={busy} onClick={()=>void choose(false)}>Оставить выключенным</button>}
  <a className="acct-link" href="/privacy" target="_blank" rel="noreferrer">Как мы обращаемся с данными<ChevronRight size={16}/></a>{note}</div>;
 if(page==='reports')return <div className="acct-stack"><section className="acct-group">{reports.map(r=><div key={r.id} className="acct-row acct-static"><Flag size={20}/><span>{r.target_kind==='ai'?'Ответ ИИ':'Сообщение'}<small>{r.resolution||(r.created_at?'Отправлена '+day(r.created_at):'')}</small></span><em>{r.status==='resolved'?'Рассмотрена':r.status==='reviewing'?'Рассматриваем':'Отправлена'}</em></div>)}{!reports.length&&<p className="acct-row acct-static">Жалоб нет.</p>}</section><p className="acct-lead">Пожаловаться можно прямо в чате: под сообщением есть кнопка «Пожаловаться».</p></div>;
 if(page==='requests'&&admin)return <div className="acct-stack"><p className="acct-lead">Видите только вы как администратор. Жалобы на сообщения — в «Управление сервисом», раздел «Жалобы и безопасность».</p><section className="acct-group">{deletions.map(r=><div key={r.id} className="acct-row acct-static acct-request"><Trash2 size={20}/><span>Запрос от {day(r.requested_at)}<DeletionReview role={role} requestId={r.id} onChanged={load}/></span></div>)}{!deletions.length&&<p className="acct-row acct-static">Новых запросов нет.</p>}</section></div>;
 if(page==='delete')return <div className="acct-stack">{requested?<>
  <section className="acct-group"><div className="acct-row acct-static"><Clock size={20}/><span>Запрос отправлен {state.deletion.requested_at?day(state.deletion.requested_at):''}<small>{details.review?.note||'Проверяем, что нет незавершённых броней, уборок и расчётов. Данные пока на месте.'}</small></span></div></section>
  <AccountDeletion role={role} accountId={state.userId} details={details} onChanged={load}/>
  <button type="button" className="acct-wide" disabled={busy||loading} onClick={()=>void act(()=>safety(role,'deletion',{action:'cancel',confirmed:true}))}>Отозвать запрос</button></>:<>
  <p className="acct-lead">Удалим аккаунт целиком, со всеми ролями: гостя, владельца и исполнителя. Сначала проверим, что нет незавершённых броней, уборок и расчётов, и напишем вам результат.</p>
  <label className="acct-check"><input type="checkbox" checked={confirmed} disabled={busy||loading} onChange={e=>setConfirmed(e.target.checked)}/>Понимаю, что удалятся все мои роли</label>
  <button type="button" className="acct-wide acct-wide-danger" disabled={busy||loading||!confirmed} onClick={()=>void act(()=>safety(role,'deletion',{action:'request',confirmed:true}))}>Запросить удаление</button></>}
  <a className="acct-link" href="/data-deletion" target="_blank" rel="noreferrer">Что удаляется и что остаётся<ChevronRight size={16}/></a>{note}</div>;
 return <div className="acct-stack">
  <section className="acct-group">{open(KeyRound,'Вход и устройства','devices',sessions?devices(sessions.length):undefined)}{open(Sparkles,'ИИ-помощник','ai',aiValue)}{reports.length>0&&open(Flag,'Мои жалобы','reports',reports.length)}</section>
  <section className="acct-group"><a className="acct-row" href="/privacy" target="_blank" rel="noreferrer"><FileText size={20}/><span>Политика конфиденциальности</span><ChevronRight size={16}/></a><a className="acct-row" href="/terms" target="_blank" rel="noreferrer"><FileText size={20}/><span>Условия сервиса</span><ChevronRight size={16}/></a></section>
  {admin&&<section className="acct-group">{open(ShieldAlert,'Запросы на удаление','requests',deletions.length?deletions.length:'нет')}</section>}
  <section className="acct-group"><button type="button" className="acct-row acct-danger" onClick={()=>go('delete')}><Trash2 size={20}/><span>Удалить аккаунт</span>{requested&&<em>запрос отправлен</em>}<ChevronRight size={16}/></button></section></div>;
}
// The administrator's deletion requests, for the service management page.
export function AdminDeletionRequests({role}:{role:string}){
 const [list,setList]=useState<Row[]|null>(null),[error,setError]=useState('');
 async function load(){try{setList((await safety(role)).deletions||[]);}catch(e:any){setError(e.message);}}
 useEffect(()=>{void load();},[role]);
 return <div className="acct-stack">{error&&<p role="alert">{error}</p>}{!list&&!error&&<p role="status"><Thinking size="sm" lead/>Загружаем…</p>}{list&&!list.length&&<p>Новых запросов на удаление нет.</p>}{list?.map(r=><div key={r.id}><strong>Запрос от {day(r.requested_at)}</strong><DeletionReview role={role} requestId={r.id} onChanged={load}/></div>)}</div>;
}
