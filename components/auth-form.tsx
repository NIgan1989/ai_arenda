'use client';
import {useState,type FormEvent} from 'react';
import {safeEntryReturn} from '../lib/entry';

type Mode='login'|'register'|'recover';
export async function logout(){
 const result=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 if(!result.ok)throw new Error('Не удалось выйти. Попробуйте ещё раз.');
 window.location.assign('/');
}
export default function AuthForm({returnTo,initialMode='login',city='Павлодар',embedded=false}:{returnTo?:string;initialMode?:'login'|'register';city?:string;embedded?:boolean}){
 const destination=safeEntryReturn(returnTo),Title=embedded?'h2':'h1';
 const [mode,setMode]=useState<Mode>(initialMode),[busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState(''),[saved,setSaved]=useState(false);
 function change(next:Mode){setMode(next);setError('');}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const values=Object.fromEntries(new FormData(event.currentTarget));
  if(mode!=='login'&&values.password!==values.confirm){setError('Пароли не совпадают.');return;}
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,city})});
   const result=await response.json() as {error?:string;recoveryCode?:string};if(!response.ok)throw new Error(result.error||'Не удалось выполнить вход.');
   if(result.recoveryCode){setCode(result.recoveryCode);setSaved(false);}else window.location.assign(destination);
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 if(code)return <section className="inline-card inline-form auth-form"><span className="welcome-eyebrow">{mode==='register'?'АККАУНТ СОЗДАН':'ПАРОЛЬ ИЗМЕНЁН'}</span><Title>Сохраните резервный код</Title><p>Скопируйте его в надёжное место. Он позволит восстановить доступ без SMS, если вы забудете пароль. Этот код показывается один раз.{mode==='recover'&&' Старый код больше не действует; на всех устройствах выполнен выход.'}</p><output className="recovery-code">{code}</output><button type="button" className="inline-button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(code);setError('Код скопирован.');}catch{setError('Выделите и скопируйте код вручную.');}}}>Скопировать код</button><label className="check-label"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>Я сохранил резервный код</label><p role="status">{error}</p><button className="inline-button" disabled={!saved} onClick={()=>{if(mode==='register')window.location.assign(destination);else{setCode('');change('login');}}}>{mode==='register'?'Продолжить':'Войти с новым паролем'}</button></section>;
 return <><span className="welcome-eyebrow">ВАШ АККАУНТ · AI АРЕНДА</span><Title>{mode==='login'?'С возвращением':mode==='register'?'Создайте аккаунт':'Восстановить доступ'}</Title><p>{mode==='login'?'Войдите по номеру телефона и паролю. Ваши квартиры, брони и переписка останутся в аккаунте.':mode==='register'?'Укажите номер и придумайте пароль. После регистрации сохраните резервный код для восстановления доступа.':'Введите телефон, сохранённый резервный код и новый пароль. Все прежние сеансы будут завершены.'}</p><div className="inline-actions auth-tabs"><button type="button" className={'inline-button'+(mode==='login'?'':' secondary')} disabled={busy} aria-pressed={mode==='login'} onClick={()=>change('login')}>Вход</button><button type="button" className={'inline-button'+(mode==='register'?'':' secondary')} disabled={busy} aria-pressed={mode==='register'} onClick={()=>change('register')}>Регистрация</button></div><form key={mode} className="inline-card inline-form auth-form" onSubmit={submit}>
 {mode==='register'&&<label>Как вас зовут<input name="name" autoComplete="name" minLength={2} maxLength={100} required/></label>}
 <label>Номер телефона<input name="phone" type="tel" autoComplete="tel" placeholder="+7 777 123 45 67" maxLength={30} required/></label>
 {mode==='recover'&&<label>Резервный код<input name="recoveryCode" autoComplete="off" spellCheck={false} maxLength={80} required/></label>}
 <label>{mode==='recover'?'Новый пароль':'Пароль'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={10} maxLength={128} required aria-describedby="password-hint"/></label><small id="password-hint">От 10 символов. Можно использовать длинную фразу.</small>
 {mode!=='login'&&<label>Повторите пароль<input name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required/></label>}
 {error&&<p className="form-error" role="alert">{error}</p>}<button className="inline-button" disabled={busy}>{busy?'Проверяю…':mode==='login'?'Войти':mode==='register'?'Создать аккаунт':'Установить новый пароль'}</button>
 {mode==='login'&&<button className="inline-button secondary" type="button" disabled={busy} onClick={()=>change('recover')}>Забыли пароль?</button>}
 <small>Номер сохраняется для входа и связи. SMS-проверка не подключена: принадлежность номера не подтверждается.</small>
 </form></>;
}
