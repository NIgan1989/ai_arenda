'use client';
import {useEffect,useRef} from 'react';
import {CircleUserRound,ChevronDown,Check,Plus,ArrowUpRight} from 'lucide-react';
import {Photo} from './media';
import {roleNames} from '../lib/access';
import type {Role} from '../lib/domain';
export function RoleMenu({connected=[],activeRole,name,avatarId}:{connected?:string[];activeRole?:Role;name?:string;avatarId?:string|null}){
 const menu=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(e.target as Node))menu.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 return <details className="profile-menu" ref={menu} onKeyDown={e=>{if(e.key==='Escape'&&menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary aria-label="Меню профиля"><Photo id={avatarId} name={name} role={activeRole||'guest'} alt={name||'Аккаунт'} avatar/><span>{name||'Мой профиль'}</span><ChevronDown size={15}/></summary><div className="profile-menu-list"><small>Рабочий профиль</small>{(['guest','owner','cleaner'] as Role[]).filter(r=>r==='guest'||connected.includes(r)).map(r=><a key={r} href={connected.includes(r)?'/workspace/'+r+'/map':'/join/'+r} aria-current={activeRole===r?'true':undefined}>{roleNames[r]}{activeRole===r&&<Check size={16}/>}</a>)}<div className="profile-menu-separator"/>{!connected.includes('owner')&&<a href="/join/owner"><Plus size={15}/>Сдавать жильё</a>}{!connected.includes('cleaner')&&<a href="/join/cleaner"><Plus size={15}/>Работать на уборках</a>}<a href={'/workspace/'+(activeRole||'guest')+'/account'}>Настройки аккаунта<ArrowUpRight size={15}/></a><a href="/">Найти жильё<ArrowUpRight size={15}/></a></div></details>;
}
