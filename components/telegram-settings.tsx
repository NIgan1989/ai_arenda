'use client';
import {useEffect,useState} from 'react';
import {ChevronRight,Send} from 'lucide-react';
import {Button} from './ui/button';
import './account-list.css';

type State={configured:boolean;linked:boolean;enabled:boolean;linkedAt:number};
// Notifications of this role in a personal Telegram chat: one tap opens the bot, Start links it.
export function TelegramSettings({role}:{role:string}){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState<number|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function api(path:string,body:object={}):Promise<any>{const r=await fetch('/api/operations/'+path,{method:'POST',cache:'no-store',headers:{'X-Workspace-Role':role,'Content-Type':'application/json'},body:JSON.stringify(body)});const v:any=await r.json();if(!r.ok)throw Error(v.error||'Не получилось.');return v;}
 async function load(){try{const s=await api('delivery/status');setState(s);return s as State;}catch(e:any){setError(e.message);return null;}}
 useEffect(()=>{setState(null);setMessage('');setError('');load();},[role]);
 // While the person is in Telegram, check every few seconds whether Start arrived.
 useEffect(()=>{if(waiting===null)return;let n=0;const t=setInterval(async()=>{n++;const s=await load();if(s&&s.linkedAt>waiting){setWaiting(null);setMessage('Telegram подключён. Бот прислал подтверждение.');clearInterval(t);}if(n>=40){setWaiting(null);clearInterval(t);}},3000);return()=>clearInterval(t);},[waiting]);
 async function connect(){const tab=window.open('','_blank');setBusy(true);setError('');setMessage('');try{const r=await api('delivery/telegram');if(tab)tab.location.href=r.url;else window.location.href=r.url;setWaiting(state?.linkedAt||0);}catch(e:any){tab?.close();setError(e.message);}finally{setBusy(false);}}
 async function toggle(on:boolean){setBusy(true);setError('');setMessage('');try{const r=await api('delivery/channel',{channel:'telegram',enabled:on});setMessage(r.message);await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const status=!state?'Проверяю…':!state.configured?'Скоро':state.enabled?'Включён':state.linked?'Выключен':'Не подключён';
 return <details className="acct-details"><summary><Send size={20}/><span>Telegram</span><em>{status}</em><ChevronRight size={16}/></summary><div className="acct-body">
  <p>Заявки, брони и уборки этой роли будут приходить в личный чат с ботом «Ай Аренда».</p>
  {!state?<p role="status">Проверяю…</p>:!state.configured?<p>Бот уведомлений скоро заработает. Пока события приходят в приложение.</p>
   :!state.linked||waiting!==null?<><p>{waiting!==null?'Откройте Telegram и нажмите «Start» в чате с ботом. Я жду подтверждения…':'Откроется чат с ботом: нажмите «Start», и всё.'}</p><div className="inline-actions"><Button disabled={busy} onClick={connect}>{waiting!==null?'Открыть ещё раз':'Подключить Telegram'}</Button></div></>
   :<div className="inline-actions"><Button variant={state.enabled?'ghost':'default'} disabled={busy} onClick={()=>toggle(!state.enabled)}>{state.enabled?'Выключить':'Включить снова'}</Button><Button variant="outline" disabled={busy} onClick={connect}>Привязать другой чат</Button></div>}
  {message&&<p role="status">{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
 </div></details>;
}
