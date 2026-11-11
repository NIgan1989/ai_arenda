'use client';
import {useEffect,useRef,useState} from 'react';
import {UserRound,ArrowUpRight,House,Brush,LogIn,MapPin} from 'lucide-react';
import {MapWorkspace} from './map-workspace';
import {Popover,PopoverTrigger,PopoverContent} from './ui/popover';
import {bookingEntryPath} from '../lib/entry';
import '../app/chat.css';
import '../app/warm-theme.css';
import './public-map.css';
type Row=Record<string,any>;
const publicData={profile:{city:'Павлодар'},properties:[],ownProperties:[],bookings:[],jobs:[],applications:[]};
export default function PublicHome(){
 const mapSection=useRef<HTMLDivElement>(null);
 const [access,setAccess]=useState<Row|null>(null),[entering,setEntering]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;fetch('/api/access',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(value=>{if(live)setAccess(value as Row|null);}).catch(()=>{});return()=>{live=false;};},[]);
 async function choose(property:Row,filters:Row){
  if(entering)return;const next=bookingEntryPath(property.id,filters);
  if(!access?.user){window.location.assign('/signin?next='+encodeURIComponent(next));return;}
  setEntering(true);setError('');
  try{if(!JSON.parse(access.profile?.roles||'[]').includes('guest')){const response=await fetch('/api/onboarding/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:filters.city||property.city})});if(!response.ok)throw Error('Не удалось подготовить кабинет гостя. Попробуйте войти снова.');}window.location.assign(next);}catch(e:any){setError(e.message);setEntering(false);}
 }
 return <div className="chat-app workspace-shell public-map-shell release-public smart-public" data-section="map">

  <nav className="public-map-account" aria-label="Вход и разделы сервиса"><Popover><PopoverTrigger className="public-map-menu-trigger" aria-label={access?.user?'Аккаунт и разделы':'Вход и разделы'}><UserRound size={22}/></PopoverTrigger><PopoverContent align="end" className="public-map-menu"><strong>{access?.user?access.profile?.name||access.user.name:'Добро пожаловать'}</strong><p>Смотрите жильё и проверяйте даты без регистрации.</p>{access?.platformAdmin&&<a href="/admin"><House size={18}/>Управление сервисом<ArrowUpRight size={16}/></a>}<a href={access?.user?'/workspace/guest/map':'/signin'}><LogIn size={18}/>{access?.user?'Мой кабинет':'Войти или зарегистрироваться'}<ArrowUpRight size={16}/></a><a href="/join/owner"><House size={18}/>Сдавать недвижимость<ArrowUpRight size={16}/></a><a href="/join/cleaner"><Brush size={18}/>Работать на уборках<ArrowUpRight size={16}/></a><small><MapPin size={14}/>До подтверждения брони показываем приблизительное расположение.</small><div className="public-legal-links"><a href="/privacy">Приватность</a><a href="/terms">Условия пилота</a><a href="/data-deletion">Удаление данных</a></div></PopoverContent></Popover></nav>
  <div className="workspace-content" ref={mapSection}><main className="chat-main"><div className="chat-transcript is-empty"><MapWorkspace publicMode role="guest" accountId="public" data={publicData} onChoose={choose} onDiscussion={()=>{}} onProcess={()=>{}} onCreate={()=>{}} onAsk={()=>{}}/></div></main></div>
  {(error||entering)&&<div className="public-map-entry-status" role={error?'alert':'status'}>{error||'Переходим к бронированию…'}{error&&<button type="button" onClick={()=>setError('')} aria-label="Закрыть сообщение">×</button>}</div>}
 </div>;
}
