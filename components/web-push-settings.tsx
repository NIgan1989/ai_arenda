'use client';
import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
import {Button} from './ui/button';

type PushState={configured:boolean;publicKey:string;enabled:boolean};
function keyBytes(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export function WebPushSettings({role}:{role:string}){
 const [state,setState]=useState<PushState|null>(null),[supported,setSupported]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function api(body?:object){const response=await fetch('/api/push',{cache:'no-store',method:body?'POST':'GET',headers:{'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json() as PushState&{error?:string;message?:string};if(!response.ok)throw Error(result.error||'Не удалось сохранить настройки.');return result;}
 useEffect(()=>{let active=true;setState(null);setMessage('');setError('');setSupported(window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);api().then(value=>{if(active)setState(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[role]);
 async function change(action:'subscribe'|'remove'|'test'){
  setBusy(true);setError('');setMessage('');
  // Call permission directly from the click handler, before network/registration awaits.
  const permission=action==='subscribe'?Notification.requestPermission():Promise.resolve('granted');
  try{
   if(await permission!=='granted')throw Error('Разрешите уведомления в настройках браузера для этого сайта.');
   let body:object={action};
   if(action==='subscribe'){
    const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(subscription?.options.applicationServerKey&&Array.from(new Uint8Array(subscription.options.applicationServerKey)).join()!==Array.from(keyBytes(state!.publicKey)).join()){await subscription.unsubscribe();subscription=null;}
    subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(state!.publicKey)});
    body={action,subscription:subscription.toJSON()};
   }
   const result=await api(body);setState(await api());setMessage(result.message||'Настройки сохранены.');
   // Removing one role keeps other opted-in roles on this browser intact.
  }catch(e){setError(e instanceof Error?e.message:'Не удалось настроить уведомления.');}finally{setBusy(false);}
 }
 return <section className="inline-card" aria-labelledby="push-title"><div style={{display:'flex',gap:12,alignItems:'center'}}><Bell size={21}/><h3 id="push-title">Уведомления на устройстве</h3></div><p>Заявки, изменения брони и другие события вашей роли, даже когда страница закрыта.</p><small>В сообщении нет адресов, кодов доступа и платёжных данных. После выхода из аккаунта доставка прекращается. Настройка отдельная для каждой роли и каждого устройства.</small>
 {!supported?<p>Откройте сайт в браузере с поддержкой push. На iPhone или iPad добавьте сайт на экран «Домой» через меню «Поделиться» и откройте его оттуда.</p>:!state?<p role="status">Проверяю настройки…</p>:!state.configured?<p>Сервер push-уведомлений ещё не подключён.</p>:<><p>{state.enabled?'Включены для этой роли':'Выключены для этой роли'}</p><div className="inline-actions" style={{flexWrap:'wrap'}}><Button disabled={busy} onClick={()=>change('subscribe')}>{state.enabled?'Обновить разрешение':'Включить уведомления'}</Button>{state.enabled&&<><Button variant="outline" disabled={busy} onClick={()=>change('test')}>Проверить доставку</Button><Button variant="ghost" disabled={busy} onClick={()=>change('remove')}>Отключить</Button></>}</div></>}
 {message&&<p role="status">{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
