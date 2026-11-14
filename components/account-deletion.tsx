'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
type Row=Record<string,any>;
const phrase='УДАЛИТЬ АККАУНТ';
const buttonStyle={minHeight:44,height:'auto',whiteSpace:'normal' as const};
async function deletionRequest(role:string,body:Row){const r=await fetch('/api/operations/safety/account-deletion',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':role},body:JSON.stringify(body),cache:'no-store'}),value=await r.json() as Row;if(!r.ok)throw Error(value.error||'Действие не подтверждено. Обновите состояние.');return value;}
function clearServiceDrafts(accountId?:string){for(const storageName of ['sessionStorage','localStorage'] as const){try{const storage=window[storageName],keys=Array.from({length:storage.length},(_,i)=>storage.key(i));for(const key of keys)if(key&&(key==='ai-arenda-next-intent'||!!accountId&&(key.startsWith('administrator-draft:'+accountId+':')||key.startsWith('discussion-draft:'+accountId+':'))))storage.removeItem(key);}catch{}}}
// Shown only once the server allows erasing now: password, the phrase and one confirmation.
export function AccountDeletion({role,details,onChanged,accountId}:{role:string;accountId?:string;details?:Row;onChanged:()=>Promise<unknown>}){
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState<Row|null>(null),lock=useRef(false);
 const pending=details?.request?.status==='requested'&&typeof details.request.id==='string',canErase=pending&&details?.canEraseActiveDatabase===true;
 useEffect(()=>{setPassword('');setConfirmation('');setConfirmed(false);setNotice('');},[role,details?.request?.id,canErase]);
 async function erase(){
  if(lock.current||!canErase||!confirmed||confirmation!==phrase||password.length<10)return;
  lock.current=true;setBusy(true);setNotice('');window.dispatchEvent(new CustomEvent('rental-account-action-pending',{detail:true}));
  try{
   const value=await deletionRequest(role,{action:'erase',requestId:details!.request.id,confirmed:true,confirmation:phrase,password});
   setResult(value);setNotice(value.message||'Готово.');setConfirmed(false);setConfirmation('');
   if(value.signOut===true){clearServiceDrafts(accountId);window.dispatchEvent(new CustomEvent('rental-account-signed-out',{detail:value}));}else await onChanged();
  }catch(e:any){setNotice(e.message);try{await onChanged();}catch{}}finally{setPassword('');lock.current=false;setBusy(false);window.dispatchEvent(new CustomEvent('rental-account-action-pending',{detail:false}));}
 }
 if(result?.signOut)return <section className="acct-group acct-done" aria-label="Аккаунт удалён"><h3>Аккаунт удалён</h3><p role="status">{result.message}</p>{result.receipt&&<small>Номер квитанции: <span style={{overflowWrap:'anywhere'}}>{result.receipt.id}</span></small>}<Button style={buttonStyle} type="button" onClick={()=>window.location.replace('/signin')}>На экран входа</Button></section>;
 if(!canErase)return null;
 return <form className="acct-group acct-form" onSubmit={e=>{e.preventDefault();void erase();}}><p>Проверка пройдена, аккаунт можно удалить сейчас. Отменить это будет нельзя.</p><label>Пароль<Input style={{minHeight:44}} type="password" autoComplete="current-password" aria-label="Пароль для удаления аккаунта" maxLength={128} minLength={10} required value={password} readOnly={busy} onChange={e=>setPassword(e.target.value)}/></label><label>Напишите «{phrase}»<Input style={{minHeight:44}} autoComplete="off" spellCheck={false} aria-label="Фраза подтверждения удаления" maxLength={40} required value={confirmation} readOnly={busy} onChange={e=>setConfirmation(e.target.value)}/></label><label className="acct-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Понимаю, что это навсегда и вход завершится на всех устройствах</label><Button style={buttonStyle} type="submit" variant="destructive" disabled={busy||confirmation!==phrase||!confirmed||password.length<10}>Удалить навсегда</Button>{notice&&<p role="status">{notice}</p>}</form>;
}
export function DeletionReview({role,requestId,onChanged}:{role:string;requestId:string;onChanged:()=>Promise<unknown>}){
 const [status,setStatus]=useState('reviewing'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<Row|null>(null),[notice,setNotice]=useState(''),lock=useRef(false);
 async function submit(e:FormEvent){e.preventDefault();if(lock.current||!note.trim())return;lock.current=true;setBusy(true);setNotice('');try{const value=await deletionRequest(role,{action:'review',requestId,status,note});setResult(value);setNotice(value.message);await onChanged();}catch(e:any){setNotice(e.message);}finally{lock.current=false;setBusy(false);}}
 return <details style={{marginTop:12,borderTop:'1px solid var(--border)',paddingTop:12}}><summary style={{minHeight:44,cursor:'pointer'}}>Ответить на запрос №{requestId}</summary><p>Ответ увидит пользователь. Данные этим не удаляются.</p><form className="inline-form" onSubmit={submit}><label>Статус<select style={{minHeight:44}} value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}><option value="reviewing">В работе</option><option value="needs_action">Нужны действия пользователя</option></select></label><label>Ответ заявителю<Textarea required maxLength={1500} value={note} readOnly={busy} onChange={e=>setNote(e.target.value)}/></label><Button style={buttonStyle} type="submit" disabled={busy||!note.trim()}>Отправить ответ</Button></form>{notice&&<p role="status">{notice}</p>}{result?.blockers?.length>0&&<ul>{(result?.blockers||[]).map((item:Row)=><li key={item.code}>{item.label}{Number(item.count)>0?' · '+item.count:''}</li>)}</ul>}</details>;
}
