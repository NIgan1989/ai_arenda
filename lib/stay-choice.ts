// A stay or a cleaning chosen the way a person says it: a day, a time and "how many" — instead of two raw
// date-and-time fields. Kazakhstan keeps one time all year (UTC+5), so the shift is fixed.
type Row=Record<string,any>;
const SHIFT=18000,DAY=86400;
export type StayMode='daily'|'hourly'|'nightly';
export type StayChoice={mode:StayMode;day:number;time:number;count:number};
export const stayDay=(t:number)=>Math.floor((t+SHIFT)/DAY)*DAY-SHIFT;
export const stayClock=(minutes:number)=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
// «2026-11-13T14:00+05:00»: the form in which the server takes a moment of Kazakhstan time.
export const stayStamp=(t:number)=>new Date((t+SHIFT)*1000).toISOString().slice(0,16)+'+05:00';
export const stayModes=(property:Row):StayMode[]=>['daily',...(property.policy?.hourly_price>0?['hourly' as const]:[]),...(property.policy?.nightly_price>0?['nightly' as const]:[])];
export const stayRate=(property:Row,mode:StayMode)=>mode==='hourly'?property.policy.hourly_price:mode==='nightly'?property.policy.nightly_price:property.price;
// An owner may ask for a whole day as the hourly minimum, so the ceiling never falls below it.
export const stayLimits=(mode:StayMode,policy:Row={})=>mode==='hourly'?{min:Math.max(1,policy.min_hours||1),max:Math.max(23,policy.min_hours||1)}:{min:1,max:30};
// A night is tied to the owner's check-in and check-out times; a day and an hour start when the guest says.
export function stayInterval(choice:StayChoice,policy:Row={}){
 if(choice.mode==='nightly')return {start:choice.day+(policy.checkin_minutes??840)*60,end:choice.day+choice.count*DAY+(policy.checkout_minutes??720)*60};
 const start=choice.day+choice.time*60;return {start,end:start+choice.count*(choice.mode==='hourly'?3600:DAY)};
}
export const stayDays=(now:number,length=21)=>Array.from({length},(_,i)=>stayDay(now)+i*DAY);
// Half-hour steps; today only the ones still ahead.
export function stayTimes(day:number,now:number){const all=Array.from({length:48},(_,i)=>i*30);return all.filter(m=>day+m*60>now);}
// The first choice offered: tomorrow at check-in time for days and nights, the nearest whole hour for hours.
export function defaultStay(mode:StayMode,policy:Row={},now:number):StayChoice{
 const limits=stayLimits(mode,policy);
 if(mode==='hourly'){const next=Math.ceil((now+1800)/3600)*3600,day=stayDay(next);return {mode,day,time:(next-day)/60,count:Math.max(limits.min,2)};}
 return {mode,day:stayDay(now)+DAY,time:policy.checkin_minutes??840,count:1};
}
// Keeps the choice possible after the tariff, the day or the clock changed.
export function settleStay(choice:StayChoice,policy:Row={},now:number):StayChoice{
 const limits=stayLimits(choice.mode,policy),count=Math.min(limits.max,Math.max(limits.min,Math.round(choice.count)||limits.min));
 if(choice.mode==='nightly')return {...choice,count,time:policy.checkin_minutes??840};
 const times=stayTimes(choice.day,now);if(!times.length)return settleStay({...choice,day:choice.day+DAY},policy,now);
 return {...choice,count,time:times.includes(choice.time)?choice.time:times.find(m=>m>=choice.time)??times[0]};
}
// A stay given as two moments (from a search or an offer) turned into a choice of the same tariff.
export function stayFromInterval(mode:StayMode,start:number,end:number,policy:Row={}):StayChoice{
 const day=stayDay(start),limits=stayLimits(mode,policy),raw=mode==='hourly'?Math.ceil((end-start)/3600):mode==='nightly'?Math.round((stayDay(end)-day)/DAY):Math.ceil((end-start)/DAY);
 return {mode,day,time:Math.round((start-day)/1800)*30%1440,count:Math.min(limits.max,Math.max(limits.min,raw||limits.min))};
}
export const stayUnit=(mode:StayMode,n:number)=>{const tens=n%100,units=n%10,few=units>=2&&units<=4&&!(tens>=12&&tens<=14),one=units===1&&tens!==11;return mode==='hourly'?(one?'час':few?'часа':'часов'):mode==='nightly'?(one?'ночь':few?'ночи':'ночей'):'сут'+(one?'ки':'ок');};
