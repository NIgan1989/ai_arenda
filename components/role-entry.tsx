'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {ArrowUpRight,Brush,Home,KeyRound,Sparkles} from 'lucide-react';
import {roleNames} from '../lib/access';
import type {Role} from '../lib/domain';
import '../app/chat.css';
type Row=Record<string,any>;
const choices:{role:Role;description:string;icon:typeof Home}[]=[{role:'guest',description:'Подбор жилья, бронирования и проживание',icon:KeyRound},{role:'owner',description:'Квартиры, заявки гостей и подготовка заездов',icon:Home},{role:'cleaner',description:'Поиск уборок, назначения и отчёты',icon:Brush}];
export default function RoleEntry(){
  const [access,setAccess]=useState<Row|null>(null),[ready,setReady]=useState(false),[role,setRole]=useState<Role|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{fetch('/api/access',{cache:'no-store'}).then(async r=>{if(r.status===401){setAccess(null);return;}const body=await r.json() as Row;if(!r.ok)throw new Error(body.error);setAccess(body);}).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
  const connected:Role[]=access?.profile?.roles?JSON.parse(access.profile.roles):[];
  function choose(target:Role){if(connected.includes(target)){window.location.assign('/workspace/'+target+'/overview');return;}setRole(target);setError('');}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!role||busy)return;setBusy(true);setError('');
    try{const body={...access?.profile,...Object.fromEntries(new FormData(e.currentTarget)),roles:[...new Set([...connected,role])]};const response=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json() as Row;if(!response.ok)throw new Error(result.error);window.location.assign('/workspace/'+role+'/overview');}catch(e:any){setError(e.message);setBusy(false);}
  }
  return <div className="role-entry"><header className="chat-header"><a className="chat-logo" href="/"><span><Sparkles size={22}/></span><span className="brand-copy">AI Аренда<small>Жильё и заботы под контролем</small></span></a>{access?.user&&<a className="about-button" href="/signout-with-chatgpt?return_to=/">Выйти</a>}</header><main className="role-entry-main">
    {!ready?<p role="status">Проверяю вход…</p>:!access?.user?<><span className="welcome-eyebrow">ДОСТУП К ПЛАТФОРМЕ</span><h1>Сначала войдите</h1><p>После входа укажите свою роль. Для гостей, владельцев и исполнителей предусмотрены отдельные страницы и ассистент.</p><a className="inline-button" href="/signin-with-chatgpt?return_to=/" target="_top">Войти через ChatGPT<ArrowUpRight size={17}/></a></>:role?<><span className="welcome-eyebrow">ПРОФИЛЬ · {roleNames[role]}</span><h1>Познакомимся</h1><p>Сохраните сведения для этой роли, чтобы открыть её страницы.</p><form className="inline-card inline-form role-profile" onSubmit={submit} key={role}>
      <label>Имя<input name="name" required maxLength={100} defaultValue={access.profile?.name||access.user.name||''}/></label><label>Контакт для связи<input name="contact" required maxLength={120} defaultValue={access.profile?.contact||''}/></label><label>Город<input name="city" required maxLength={80} defaultValue={access.profile?.city||'Павлодар'}/></label>
      {role==='cleaner'&&<><label>Удобные районы<input name="districts" required maxLength={300} defaultValue={access.profile?.districts||''}/></label><label>Опыт уборки<textarea name="experience" required maxLength={1000} defaultValue={access.profile?.experience||''}/></label><label>График<input name="availability" required maxLength={300} defaultValue={access.profile?.availability||''}/></label></>}
      <p className="quote-note">Это профиль участника. Проверка документов и права сдавать квартиру пока не подключена.</p><div className="inline-actions"><button className="inline-button" disabled={busy}>{busy?'Сохраняю…':'Сохранить и открыть страницы'}</button><button className="inline-button secondary" type="button" disabled={busy} onClick={()=>setRole(null)}>Назад к ролям</button></div>
    </form></>:<><span className="welcome-eyebrow">ВХОД В РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>В какой роли продолжим?</h1><p>Выберите роль. На её страницах будут только соответствующие задачи и действия. Роль можно сменить позже.</p><div className="role-choices">{choices.map(({role,description,icon:Icon})=><button key={role} onClick={()=>choose(role)}><Icon size={27}/><strong>{roleNames[role]}</strong><span>{description}</span><small>{connected.includes(role)?'Открыть страницы':'Заполнить профиль'} <ArrowUpRight size={15}/></small></button>)}</div></>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </main></div>;
}
