'use client';
import {useEffect,useState} from 'react';
import {Brand} from './brand';
import AuthForm from './auth-form';
import {safeEntryReturn} from '../lib/entry';
import '../app/chat.css';
import '../app/warm-theme.css';
export default function SignInScreen({next,register=false}:{next?:string;register?:boolean}){
 const destination=safeEntryReturn(next),[ready,setReady]=useState(false),[error,setError]=useState('');
 const city=new URL(destination,'https://arenda.local').searchParams.get('city')?.slice(0,80)||'Павлодар';
 useEffect(()=>{let live=true;(async()=>{try{const r=await fetch('/api/access',{cache:'no-store'});if(r.status===401){if(live)setReady(true);return;}const data=await r.json() as any;if(!r.ok)throw new Error(data.error||'Не удалось проверить вход.');if(destination.startsWith('/workspace/guest/')&&!JSON.parse(data.profile?.roles||'[]').includes('guest')){const result=await fetch('/api/onboarding/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city})});if(!result.ok)throw new Error('Не удалось подготовить кабинет гостя.');}if(live)window.location.replace(destination);}catch(e:any){if(live){setError(e.message);setReady(true);}}})();return()=>{live=false;};},[destination,city]);
 return <div className="role-entry"><header className="chat-header"><Brand/><a className="about-button" href="/">Вернуться к поиску</a></header><main className="role-entry-main sign-in-main">{!ready?<p role="status">Проверяю вход…</p>:<><AuthForm returnTo={destination} initialMode={register?'register':'login'} city={city}/>{error&&<p className="form-error" role="alert">{error}</p>}<p className="entry-note">Один аккаунт для поездок, сдачи жилья и работы на уборках.</p></>}</main></div>;
}
