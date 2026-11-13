'use client';
import {Thinking} from './thinking';
import {Input} from '@/components/ui/input';
import {useQuery} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {MessagesSquare,Search,Sparkles,Pin,Plus,Lock} from 'lucide-react';
import './process-discussion.css';
import {IdentityAvatar} from './identity-avatar';
type Row=Record<string,any>;
export async function chatAPI(role:string,action:string,body?:Row){const r=await fetch('/api/operations/discussion/'+action,{method:body?'POST':'GET',headers:{'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const value=await r.json() as Row;if(!r.ok)throw Object.assign(Error(value.error||'Нет связи с чатом. Попробуйте ещё раз.'),{status:r.status});return value;}
export function useDiscussionInbox(role:string,accountId:string){
 return useQuery<Row,Error>({queryKey:['discussion-inbox',accountId,role],queryFn:()=>chatAPI(role,'inbox'),staleTime:5000,refetchInterval:8000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,retry:1});
}
export function ChatInbox({role,accountId,onOpen,selectedRoomId,onAdministrator,administratorSelected,administratorHint}:{role:string;accountId:string;selectedRoomId?:string;onOpen:(context:Row)=>void;onAdministrator:()=>void;administratorSelected?:boolean;administratorHint?:string}){
 const {data,error:failure}=useDiscussionInbox(role,accountId),error=failure?.message||'',[query,setQuery]=useState('');
 const rooms=(data?.rooms||[]) as Row[],available=(data?.items||[]).filter((i:Row)=>!rooms.some(r=>!r.archived&&r.kind===i.kind&&r.entityId===i.id));
 const matches=(text:string)=>text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
 const when=(v:number)=>{const d=new Date(v*1000),now=new Date(),same=d.toDateString()===now.toDateString();return same?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});};
 return <section className="chat-inbox" aria-label="Переписка по вашим броням и уборкам"><header className="inbox-heading"><h1>Чаты</h1></header><label className="inbox-search"><Search size={18}/><Input type="search" aria-label="Найти диалог" placeholder="Поиск" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <div className="inbox-list">{matches("AI администратор "+(administratorHint||""))&&<button className="inbox-room administrator-contact" aria-pressed={!!administratorSelected} onClick={onAdministrator}><span className="inbox-avatar ai-avatar" aria-hidden="true"><Sparkles size={22}/></span><span><strong>AI администратор</strong><span>{administratorHint||"Спросите о бронях, жилье и уборках"}</span></span><span><Pin size={14} aria-label="Закреплён"/></span></button>}
 {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status"><Thinking size="sm" lead/>Загружаю диалоги…</p>}
 {rooms.filter(r=>matches(r.title+' '+r.members.map((m:Row)=>m.name).join(' ')+' '+(r.latest?.body||''))).map(r=><button className={'inbox-room'+(r.unread>0?' has-unread':'')} key={r.id} aria-pressed={selectedRoomId===r.id} onClick={()=>onOpen({roomId:r.id})}><IdentityAvatar person={r.members.find((m:Row)=>m.role!==role)||r.members[0]} role={role} roomId={r.id}/><span><strong>{r.members.filter((m:Row)=>m.role!==role).map((m:Row)=>m.name).join(', ')}</strong><span>{r.latest?(r.latest.photo?'📷 Фото · ':'')+r.latest.body:r.title}</span></span><span>{r.latest&&<time>{when(r.latest.created_at)}</time>}{r.unread>0&&<b className="unread-badge" aria-label={'Непрочитанных: '+r.unread}>{r.unread}</b>}</span></button>)}
 {available.filter((i:Row)=>matches(i.title)).map((i:Row)=><button className="inbox-room" key={i.kind+i.id} onClick={()=>onOpen({kind:i.kind,entityId:i.id,channel:i.kind==='job'?'cleaning':'stay',connect:true})}><span className="inbox-avatar" aria-hidden="true"><MessagesSquare size={22}/></span><span><strong>{i.title}</strong><span>{i.kind==='booking'?'Начать чат с '+(role==='guest'?'владельцем':'гостем'):'Начать чат по уборке'}</span></span><span><Plus size={18} aria-hidden="true"/></span></button>)}</div>
 {data&&!rooms.length&&!available.length&&<p className="inbox-empty">Чаты появятся вместе с бронью или уборкой.</p>}<p className="inbox-privacy"><Lock size={12} aria-hidden="true"/>Личные сообщения видят только участники</p></section>;
}
