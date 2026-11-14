// Which notices reach the person and which stay in the journal. Pure: the server, the site and the app share it.
// The service says many things: a guest asked, a payment came, a cleaning is late, and also every step the AI
// administrator made by itself. A person who handed the routine to the AI should hear only what needs them or
// concerns their money; the rest is written down in «Что сделал ИИ» and shown on the map.
// Covered by tests/notice-feed.test.mjs.
import {aiMarkOf,type AiMove} from './ai-move-marks';

export type Notice={id:string;body:string;dedupe:string;created_at:number};
// Steps of the AI that still ask for attention: it checked a cleaning report and asks to accept it, reminded about
// a deadline, passed a delay on, took an assignment off.
const LOUD:AiMove[]=['checked','reminded','escalated','released'];
// Steps of the AI after which the owner has nothing to do and no money has moved: it answered a guest by the tariff,
// accepted a cleaning by its photos, assigned a performer. They are not sent to Telegram or as a push.
const SILENT:AiMove[]=['answered','accepted','assigned'];

// calm: the AI did a step alone and nothing is asked of the person; event: everything else.
export function noticeTone(n:{dedupe?:unknown;body?:unknown;created_at?:unknown}):'calm'|'event'{
 const mark=aiMarkOf(n?.dedupe,Number(n?.created_at)||0,n?.body);
 return mark&&!LOUD.includes(mark.move)?'calm':'event';
}
// A notice that is kept out of Telegram and push: a message from the service then always means «look».
// A booking the AI confirmed, a check-in and a checkout are still sent: they are about money and the home.
export function silentNotice(dedupe:unknown,body?:unknown){
 if(typeof dedupe!=='string'||!dedupe.startsWith('owner:'))return false;
 const mark=aiMarkOf(dedupe,0,body);
 return !!mark&&SILENT.includes(mark.move);
}
// The notices of one role (the key of a notice starts with its role), newest first, events only. A key may end with
// the revision of its task or the version of its cleaning: a later notice about the same thing replaces the earlier.
export function roleEvents<T extends {dedupe?:unknown;body?:unknown;created_at?:unknown}>(list:T[]|null|undefined,role:string):T[]{
 const seen=new Set<string>();
 return (list||[]).filter(n=>typeof n?.dedupe==='string'&&n.dedupe.startsWith(role+':')&&noticeTone(n)==='event')
  .sort((a,b)=>(Number(b.created_at)||0)-(Number(a.created_at)||0))
  .filter(n=>{const key=String(n.dedupe).replace(/:\d+$/,'');if(seen.has(key))return false;seen.add(key);return true;});
}
// The words of a notice in a list of notices: the service is the one speaking there, so its name is not repeated.
export function noticeText(body:unknown){
 const text=String(body||'').replace(/^AI администратор:\s*/,'').replace(/^Требует внимания\.\s*/,'').trim();
 return text?text[0].toUpperCase()+text.slice(1):'';
}
// The booking or the cleaning a notice is about, when the person has it in their data: its card opens by a tap.
// The key is «role:kind:id[:more]», and a task of the administrator carries its ids as a list inside the key; every
// part is looked up, so a key never opens a thing the person does not have.
export function noticeOpen(dedupe:unknown,data:{bookings?:{id?:unknown}[];jobs?:{id?:unknown}[]}|null|undefined):{kind:'booking'|'job';id:string}|null{
 if(typeof dedupe!=='string')return null;
 for(const part of dedupe.split(/[:",\[\]]+/).slice(2,10)){
  if(!part)continue;
  if((data?.bookings||[]).some(b=>b?.id===part))return {kind:'booking',id:part};
  if((data?.jobs||[]).some(j=>j?.id===part))return {kind:'job',id:part};
 }
 return null;
}
// The notices that came since the last look and are events of this role: what the app says aloud over the map.
export function freshEvents<T extends {id?:unknown;dedupe?:unknown;body?:unknown;created_at?:unknown}>(list:T[]|null|undefined,seen:{has(id:string):boolean},role:string):T[]{
 return roleEvents((list||[]).filter(n=>typeof n?.id==='string'&&!seen.has(n.id)),role);
}
// How many events came since the start of this day in Kazakhstan (UTC+5).
export function eventsToday(list:{created_at?:unknown}[],now:number){
 const start=Math.floor((now+5*3600)/86400)*86400-5*3600;
 return list.filter(n=>(Number(n?.created_at)||0)>=start).length;
}
