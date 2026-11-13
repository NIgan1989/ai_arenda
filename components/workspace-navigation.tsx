'use client';
import {Map as MapIcon,House,UserRound,Search,Building2,CalendarCheck,Brush,ClipboardList,ClipboardCheck,CalendarDays,MessagesSquare,SlidersHorizontal,type LucideIcon} from 'lucide-react';
import {roleNames,rolePages} from '../lib/access';
import {useDiscussionInbox} from './chat-inbox';
import type {Role} from '../lib/domain';
import './workspace-navigation.css';
import './workspace-release.css';
import {Brand} from './brand';
const icons:Record<string,LucideIcon>={account:UserRound,map:MapIcon,overview:House,catalog:Building2,properties:Building2,bookings:CalendarCheck,cleaning:Brush,jobs:ClipboardList,assignments:ClipboardCheck,calendar:CalendarDays,chats:MessagesSquare,operations:SlidersHorizontal};
// The guest's map is the search: a magnifier, as in the app; the catalogue is the list of flats.
export const pageIcon=(role:Role,id:string):LucideIcon=>role==='guest'&&id==='map'?Search:icons[id]||House;
// A phone has no bar of sections: the map is its only screen, and the menu and the chats open from it (see map-shell.tsx).
export function WorkspaceNavigation({role,section,accountId,platformAdmin=false}:{role:Role;section:string;accountId:string;platformAdmin?:boolean}){
 const {data:inbox}=useDiscussionInbox(role,accountId),unread=Number(inbox?.unread||0),pages=rolePages[role];
 const link=(id:string)=>{const page=pages.find(p=>p.id===id);if(!page)return null;const Icon=pageIcon(role,id);return <a key={id} href={'/workspace/'+role+'/'+id} aria-current={section===id?'page':undefined}><Icon size={19}/><span>{id==='map'?(role==='guest'?'Поиск':'Карта'):page.title}</span>{id==='chats'&&unread>0&&<b className="release-unread" aria-label={'Непрочитанных: '+unread}>{unread>99?'99+':unread}</b>}</a>;};
 return <aside className="release-sidebar" aria-label="Разделы"><Brand/><span className="release-role">{roleNames[role]}</span><nav>{pages.map(p=>link(p.id))}</nav>{platformAdmin&&<a className="release-admin-link" href="/admin"><SlidersHorizontal size={18}/>Управление сервисом</a>}</aside>;
}
