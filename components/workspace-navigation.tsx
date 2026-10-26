'use client';
import {useEffect,useRef,type RefObject} from 'react';
import {House,Search,Building2,CalendarCheck,Brush,ClipboardList,ClipboardCheck,CalendarDays,MessagesSquare,SlidersHorizontal,CircleUserRound,X,type LucideIcon} from 'lucide-react';
import {Brand} from './brand';
import {roleNames} from '../lib/access';
import {Photo} from './media';
import {rolePages} from '../lib/access';
import type {Role} from '../lib/domain';
const icons:Record<string,LucideIcon>={overview:House,catalog:Search,properties:Building2,bookings:CalendarCheck,cleaning:Brush,jobs:ClipboardList,assignments:ClipboardCheck,calendar:CalendarDays,assistant:MessagesSquare,settings:SlidersHorizontal,account:CircleUserRound};
export function WorkspaceNavigation({role,section,more,setMore,trigger,avatarId}:{avatarId?:string|null;role:Role;section:string;more:boolean;setMore:(value:boolean)=>void;trigger:RefObject<HTMLButtonElement|null>}){
 const menu=useRef<HTMLDivElement>(null),pages=rolePages[role];
 const main=pages.filter(p=>!['settings','account'].includes(p.id)),primaryIds=role==='guest'?['overview','catalog','bookings','assistant']:role==='owner'?['overview','properties','bookings','assistant']:['overview','jobs','assignments','assistant'];
 const primary=primaryIds.map(id=>pages.find(p=>p.id===id)!),extra=pages.filter(p=>!primaryIds.includes(p.id)&&p.id!=='account');
 const close=()=>{setMore(false);trigger.current?.focus();};
 useEffect(()=>{if(!more)return;const first=menu.current?.querySelector<HTMLElement>('button,a');first?.focus();const media=window.matchMedia('(min-width:701px)');const resize=()=>{if(media.matches)setMore(false);};media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[more]);
 function link(p:typeof pages[number],drawer=false){const Icon=icons[p.id]||House;return <a key={p.id} className={drawer?'drawer-link':'nav-icon'} href={'/workspace/'+role+'/'+p.id} aria-label={p.title} aria-current={section===p.id?'page':undefined} data-tooltip={p.title} title={p.title}>{p.id==='account'?<span className="account-avatar"><Photo id={avatarId} role={role} alt="Аккаунт" avatar/></span>:<Icon size={25} strokeWidth={1.75}/>} <span className={drawer?'':'nav-label'}>{p.title}</span></a>;}
 return <><nav className="workspace-navigation" aria-label="Страницы роли"><div className="desktop-rail"><Brand subtitle={roleNames[role]+' · Казахстан'}/><div className="rail-pages">{main.map(p=>link(p))}</div><div className="rail-account">{pages.filter(p=>['settings','account'].includes(p.id)).map(p=>link(p))}</div></div><div className="mobile-tabs">{primary.map(p=>link(p))}{link(pages.find(p=>p.id==='account')!)}</div></nav>
 {more&&<div className="navigation-overlay"><button className="navigation-backdrop" aria-label="Закрыть меню разделов" tabIndex={-1} onClick={close}/><div id="workspace-more-menu" className="navigation-drawer" role="dialog" aria-modal="true" aria-label="Все разделы" ref={menu} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const items=menu.current?.querySelectorAll<HTMLElement>('a,button');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}><div className="drawer-heading"><h2>Все разделы</h2><button className="nav-icon" aria-label="Закрыть меню" onClick={close}><X size={22}/></button></div>{extra.map(p=>link(p,true))}</div></div>}
 </>;
}
