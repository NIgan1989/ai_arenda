'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {ArrowUpRight,Home,Brush,Check} from 'lucide-react';
import {Brand} from './brand';
import {RoleMenu} from './role-menu';
import AuthForm from './auth-form';
import {defaultGuestPath,safeEntryReturn} from '../lib/entry';
import type {Role} from '../lib/domain';
import '../app/chat.css';
import '../app/warm-theme.css';
type Row=Record<string,any>;
export default function RoleEntry({target='guest',returnTo}:{target?:Role;returnTo?:string}){
 const [access,setAccess]=useState<Row|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const connected:string[]=JSON.parse(access?.profile?.roles||'[]');
 const standard=target==='guest'?defaultGuestPath:target==='owner'?'/workspace/owner/properties':'/workspace/cleaner/jobs';
 const safe=safeEntryReturn(returnTo),destination=returnTo&&safe.startsWith('/workspace/'+target+'/')?safe:standard;
 useEffect(()=>{let active=true;fetch('/api/access',{cache:'no-store'}).then(async r=>{if(r.status===401)return null;const body=await r.json() as Row;if(!r.ok)throw new Error((body as Row).error);return body;}).then(body=>{if(active)setAccess(body);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
 useEffect(()=>{if(!access?.user)return;const roles=JSON.parse(access.profile?.roles||'[]');if(roles.includes(target)){window.location.replace(destination);return;}if(target==='guest'){setBusy(true);fetch('/api/onboarding/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>{if(!r.ok)throw new Error('Не удалось подготовить кабинет гостя.');window.location.replace(destination);}).catch(e=>{setError(e.message);setBusy(false);});}},[access?.user?.id,target,destination]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const response=await fetch('/api/onboarding/'+target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});const result=await response.json() as Row;if(!response.ok)throw new Error(result.error);const next=new URL(destination,window.location.origin);if(target==='owner'&&next.pathname==='/workspace/owner/properties')next.searchParams.set('new','1');window.location.assign(next.pathname+next.search);}catch(e:any){setError(e.message);setBusy(false);}
 }
 const owner=target==='owner';
 return <div className="role-entry"><header className="chat-header"><Brand/>{access?.user?<RoleMenu connected={connected} name={access.profile?.name||access.user.name}/>:<a className="about-button" href="/">Вернуться к поиску</a>}</header><main className="role-entry-main onboarding-main">
 {!ready?<p role="status">Проверяю аккаунт…</p>:target==='guest'?(access?.user?<p role="status">Подготавливаю кабинет гостя…</p>:<AuthForm returnTo={destination}/>):<>
 <div className="onboarding-intro"><span className="welcome-eyebrow">{owner?'ДЛЯ ВЛАДЕЛЬЦЕВ И УПРАВЛЯЮЩИХ':'РАБОТА НА УБОРКАХ'}</span><h1>{owner?'Сдавайте жильё. Мы поможем с заботами.':'Работайте там, где вам удобно.'}</h1><p>{owner?'Подключите кабинет владельца: квартиры, заявки гостей и уборки будут в одном месте. Ваш гостевой профиль останется доступен.':'Укажите удобные районы, опыт и график. Находите задания и согласовывайте условия с владельцами.'}</p><ul>{(owner?['Добавляйте квартиры и фотографии','Задавайте тарифы на часы и сутки','Следите за бронями и подготовкой заездов']:['Выбирайте район и время','Смотрите объём работы и вознаграждение','Ведите назначения и отчёты в одном кабинете']).map(text=><li key={text}><Check size={16}/>{text}</li>)}</ul></div>
 {!access?.user?<section className="onboarding-auth"><p className="entry-note">{owner?'Создайте аккаунт для подключения жилья.':'Создайте аккаунт для заполнения анкеты.'} Если аккаунт уже есть, выберите «Вход».</p><AuthForm returnTo={'/join/'+target+(returnTo?'?next='+encodeURIComponent(destination):'')} initialMode="register" embedded/></section>:<form className="inline-card inline-form onboarding-form" onSubmit={submit}><div className="onboarding-form-heading">{owner?<Home size={22}/>:<Brush size={22}/>}<h2>{owner?'Подключить кабинет владельца':'Анкета исполнителя'}</h2></div><p>Используем ваш существующий аккаунт. Повторная регистрация не нужна.</p><label>Город<input name="city" required maxLength={80} defaultValue={access.profile?.city||'Павлодар'}/></label>{!owner&&<><label>Удобные районы<input name="districts" required maxLength={300} defaultValue={access.profile?.districts||''} placeholder="Например, центр и набережная"/></label><label>Опыт уборки<textarea name="experience" required maxLength={1000} defaultValue={access.profile?.experience||''} placeholder="Какие уборки выполняете, что умеете"/></label><label>Когда готовы работать<input name="availability" required maxLength={300} defaultValue={access.profile?.availability||''} placeholder="Дни недели и удобное время"/></label></>}<small>{owner?'Подключение профиля не подтверждает право сдавать конкретный объект. Данные жилья и правила вы добавите на следующем шаге.':'Анкета не означает назначения на работу. Каждое задание и его условия согласовываются отдельно.'}</small><button className="inline-button" disabled={busy}>{busy?'Сохраняю…':owner?'Подключить и добавить жильё':'Сохранить и найти задания'}<ArrowUpRight size={16}/></button></form>}
 </>}{error&&<p className="form-error" role="alert">{error}</p>}</main></div>;
}
