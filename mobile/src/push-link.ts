import {parseProcessLink} from './deep-links';
import type {Role} from './model';

// Where a tap on a push leads. The server sends the screen in `data.url` («/workspace/owner/bookings?entity=…»,
// lib/web-push.ts pushTarget). It goes through the same check as any link (src/deep-links.ts), so a push can only
// open a screen of the app, and the card itself is checked again against fresh data. A chat opens its room.
export type PushLink={kind:'link';url:string}|{kind:'chat';role:Role;roomId?:string};
const roles=new Set(['guest','owner','cleaner']);
const chat=/^\/workspace\/(guest|owner|cleaner)\/chats(?:\?room=([A-Za-z0-9_-]{1,100}))?$/;
export function pushLink(data:unknown):PushLink|null{
 const d=(data&&typeof data==='object'?data:{}) as Record<string,unknown>,role=String(d.role||''),url=typeof d.url==='string'?d.url:'';
 const room=url.match(chat);
 if(room&&room[1]===role)return {kind:'chat',role:role as Role,...(room[2]?{roomId:room[2]}:{})};
 if(url.startsWith('/workspace/')){const link='aiarenda://workspace'+url.slice('/workspace'.length);if(parseProcessLink(link,'')?.role===role)return {kind:'link',url:link};}
 return roles.has(role)?{kind:'link',url:'aiarenda://workspace/'+role+'/map'}:null;
}
