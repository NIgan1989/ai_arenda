import {q} from './operation-core';

// «Тихие часы» of the autopilot (thread «Не назначать уборки на ночь», 2026-11-27): from 23:00 to 08:00 in Pavlodar
// (UTC+5, the same offset as the rest of the service) nobody takes a cleaning, so the AI does not look for a cleaner,
// does not wake people, and a cleaning after a night checkout goes to the morning when the next guest allows it.
// Background rules only: no model is called.
export const NIGHT_OFFSET=18000;
export const QUIET_FROM=23*60,QUIET_TO=8*60;
// The morning cleaning starts at 09:00: offers go out from 08:00, so the cleaner has an hour to answer and come.
export const MORNING=9*60;
// Tests switch the rule off by default (their times follow the real clock) and on where they check it.
export const nightRule={on:true};

const DAY=86400;
export const localMinute=(t:number)=>Math.floor((((t+NIGHT_OFFSET)%DAY)+DAY)%DAY/60);
export const isQuiet=(t:number)=>{if(!nightRule.on)return false;const m=localMinute(t);return m>=QUIET_FROM||m<QUIET_TO;};
// A cleaning from `start` for `length` seconds is a night one: it starts in the quiet hours or runs past midnight.
export const nightCleaning=(start:number,length:number)=>nightRule.on&&(isQuiet(start)||localMinute(start)*60+length>DAY);
// 09:00 local at or after t.
export function morningAfter(t:number){const day=t-(((t+NIGHT_OFFSET)%DAY)+DAY)%DAY;let m=day+MORNING*60;if(m<t)m+=DAY;return m;}
// The end of the quiet hours now under way (08:00 local), or t itself outside them.
export function quietEnd(t:number){if(!isQuiet(t))return t;const day=t-(((t+NIGHT_OFFSET)%DAY)+DAY)%DAY;let m=day+QUIET_TO*60;if(m<=t)m+=DAY;return m;}

export type CleaningWindow={start:number;end:number;moved:boolean;urgent:boolean};
// When the cleaning after a stay runs: right after it by day; after a night checkout at 09:00, unless the next guest
// (ours or from an outside calendar) comes before the morning cleaning would end. Then it stays at night («urgent»):
// the AI offers it only to cleaners who take night work and tells the owner.
// A bath, a sauna or a hall works at night too (most baths in Pavlodar are open round the clock): its cleaning is never
// moved, so the night stays on sale; only its search keeps to the quiet hours.
export async function cleaningWindow(db:D1Database,propertyId:string,bookingId:string|null,from:number,length:number,venue=false):Promise<CleaningWindow>{
 if(!nightCleaning(from,length))return {start:from,end:from+length,moved:false,urgent:false};
 if(venue)return {start:from,end:from+length,moved:false,urgent:true};
 const start=morningAfter(from),end=start+length;
 const next=await q(db,"SELECT 1 x FROM bookings WHERE property_id=? AND id<>COALESCE(?,'') AND (status='confirmed' OR (status='requested' AND expires_at>unixepoch())) AND start<? AND occupied_until>? LIMIT 1",propertyId,bookingId,end,from).first();
 const outside=next?null:await q(db,'SELECT 1 x FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE x.property_id=? AND c.enabled=1 AND x.start<? AND x.end>? LIMIT 1',propertyId,end,from).first();
 if(next||outside)return {start:from,end:from+length,moved:false,urgent:true};
 return {start,end,moved:true,urgent:false};
}

const clock=(t:number)=>new Date(t*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'});
// What the owner reads about a night cleaning.
export const movedNote=(title:string,start:number)=>`Гость уезжает из «${title}» ночью. Ночью исполнители не работают, поэтому уборка назначена на утро, ${clock(start)}. До неё жильё не сдаётся.`;
export const urgentNote=(title:string,start:number)=>`Уборка «${title}» выпадает на ночь, ${clock(start)}, и перенести её на утро нельзя. Ночью исполнители почти не откликаются: ИИ-администратор предложит её только тем, кто сам берёт ночные уборки. Если никто не возьмёт, уберите сами, назначьте своего человека в карточке уборки или предложите гостю прийти позже.`;
