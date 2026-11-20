'use client';
import {useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {Brand} from './brand';
import {Button} from './ui/button';
import {Input} from './ui/input';

// The door of «Управление сервисом»: the password opened the account, the code from Telegram opens the management
// (lib/admin-factor.ts). After the code the page reloads into the usual administration.
export function AdminFactorGate({name,telegram}:{name:string;telegram:boolean}){
 const [sent,setSent]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 async function call(body:Record<string,unknown>):Promise<{error?:string;message?:string;testCode?:string}>{
  const r=await fetch('/api/admin-factor',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=(await r.json().catch(()=>({}))) as {error?:string;message?:string;testCode?:string};
  if(!r.ok)throw new Error(data.error||'Не получилось. Попробуйте ещё раз.');return data;
 }
 async function send(){setBusy(true);setError('');try{const d=await call({action:'send'});setSent(true);setInfo((d.message||'Код отправлен.')+(d.testCode?' Код: '+d.testCode:''));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function verify(){setBusy(true);setError('');try{await call({action:'verify',code});location.reload();}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false);}}
 return <main className="min-h-dvh grid place-items-center bg-background p-4">
  <section className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm flex flex-col gap-4" aria-labelledby="factor-title">
   <Brand/>
   <div className="flex items-center gap-3"><ShieldCheck className="size-6 text-primary" aria-hidden/><h1 id="factor-title" className="text-lg font-semibold">Вход в управление</h1></div>
   <p className="text-sm text-muted-foreground">{name}, пароль подтвердил аккаунт. Чтобы управлять сервисом, введите код из Telegram. Вход действует 8 часов.</p>
   {!telegram&&<p className="text-sm text-amber-700">Telegram не подключён. Подключите его в «Аккаунте», раздел «Telegram»: код приходит только туда.</p>}
   {!sent?<Button disabled={busy} onClick={()=>void send()}>{busy?'Отправляю…':'Прислать код в Telegram'}</Button>:<form className="flex flex-col gap-3" onSubmit={e=>{e.preventDefault();void verify();}}>
    <label className="text-sm font-medium" htmlFor="factor-code">Код из Telegram</label>
    <Input id="factor-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="6 цифр" autoFocus/>
    <Button type="submit" disabled={busy||code.length!==6}>{busy?'Проверяю…':'Войти'}</Button>
    <Button type="button" variant="ghost" disabled={busy} onClick={()=>void send()}>Прислать код ещё раз</Button>
   </form>}
   {!!info&&<p className="text-sm text-muted-foreground" role="status">{info}</p>}
   {!!error&&<p className="text-sm text-destructive" role="alert">{error}</p>}
  </section>
 </main>;
}
