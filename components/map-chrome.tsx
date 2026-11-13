'use client';
import {MessagesSquare} from 'lucide-react';
import type {Role} from '../lib/domain';
import {useDiscussionInbox} from './chat-inbox';
import {Photo} from './media';

// The two buttons that replace the phone's bottom bar: the person (menu) and the chats, both over the map.
export function MapChrome({role,accountId,avatarId,name}:{role:Role;accountId:string;avatarId?:string|null;name?:string|null}){
 const {data:inbox}=useDiscussionInbox(role,accountId),unread=Number(inbox?.unread||0);
 return <nav className="map-chrome" aria-label="Меню и чаты">
  <a className="map-chrome-me" href={'/workspace/'+role+'/account'} aria-label="Меню и профиль"><Photo id={avatarId} role={role} name={name||undefined} alt="" avatar/></a>
  <a className="map-chrome-chats" href={'/workspace/'+role+'/chats'} aria-label={unread?'Чаты, непрочитанных: '+unread:'Чаты'}><MessagesSquare size={22}/>{unread>0&&<b>{unread>99?'99+':unread}</b>}</a>
 </nav>;
}
