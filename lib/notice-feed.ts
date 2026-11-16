// Which notices reach the person and which stay in the journal. Pure: the server, the site and the app share it.
// The service says many things: a guest asked, a payment came, a cleaning is late, and also every step the AI
// administrator made by itself. A person who handed the routine to the AI should hear only what needs them or
// concerns their money or their home; the rest is written down in «Что сделал ИИ» and shown on the map.
// Covered by tests/notice-feed.test.mjs.
import {aiMarkOf,type AiMove} from './ai-move-marks';

export type Notice={id:string;body:string;dedupe:string;created_at:number};
// Steps of the AI after which the person has nothing to do, no money has moved and the home is as it was: it answered
// a guest by the tariff, accepted a cleaning by its photos, assigned a performer or found another one. Only these are
// calm. A booking the AI confirmed, a check-in and a checkout are about money and the home; a cleaning the autopilot
// took is a job to go to; a cleaning moved after a late checkout takes the assignment off and asks to apply again;
// a report it checked, a reminder, a delay passed on and an assignment taken off all ask for attention.
const CALM:AiMove[]=['answered','accepted','assigned','replaced'];

// calm: the AI did a step alone and nothing is asked of the person; event: everything else.
export function noticeTone(n:{dedupe?:unknown;body?:unknown;created_at?:unknown}):'calm'|'event'{
 const mark=aiMarkOf(n?.dedupe,Number(n?.created_at)||0,n?.body);
 return mark&&CALM.includes(mark.move)?'calm':'event';
}
// A notice that is kept out of Telegram and push: a message from the service then always means «look».
// The same calm steps as in the app, for the owner: the other roles have none.
export function silentNotice(dedupe:unknown,body?:unknown){
 return typeof dedupe==='string'&&dedupe.startsWith('owner:')&&noticeTone({dedupe,body})==='calm';
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
 const text=String(body||'').replace(/^ИИ-администратор:\s*/,'').replace(/^Требует внимания\.\s*/,'').trim();
 return text?text[0].toUpperCase()+text.slice(1):'';
}
// The booking or the cleaning a notice is about, when the person has it in their data: its card opens by a tap.
// The key is «role:kind:id[:more]», and a task of the administrator carries its ids as a list inside the key; every
// part is looked up, so a key never opens a thing the person does not have. A part may also name a proposed change
// of a booking (its card is where the answer is given) or an application for a cleaning.
type Held={bookings?:{id?:unknown;changes?:{id?:unknown}[]|null}[];jobs?:{id?:unknown}[];applications?:{id?:unknown;job_id?:unknown}[]};
export function noticeOpen(dedupe:unknown,data:Held|null|undefined):{kind:'booking'|'job';id:string}|null{
 if(typeof dedupe!=='string')return null;
 const bookings=data?.bookings||[],jobs=data?.jobs||[];
 for(const part of dedupe.split(/[:",\[\]]+/).slice(2,10)){
  if(!part)continue;
  if(bookings.some(b=>b?.id===part))return {kind:'booking',id:part};
  if(jobs.some(j=>j?.id===part))return {kind:'job',id:part};
  const changed=bookings.find(b=>(b?.changes||[]).some(c=>c?.id===part));
  if(changed&&typeof changed.id==='string')return {kind:'booking',id:changed.id};
  const applied=(data?.applications||[]).find(v=>v?.id===part);
  if(applied&&jobs.some(j=>j?.id===applied.job_id))return {kind:'job',id:String(applied.job_id)};
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
