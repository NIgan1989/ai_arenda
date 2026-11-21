import {dateText,t} from './i18n';
// A guest can say «Я заселился», and the owner can confirm the check-in, only from 15 minutes before the agreed
// check-in time: earlier the place may still be occupied or being cleaned. The same rule holds on the site, in the app
// and on the server.
export const CHECKIN_LEAD_SECONDS=15*60;
// The owner may open it earlier when the home is ready («Можно заселиться раньше», lib/arrival-shift.ts): `early` is then
// the moment the owner allowed it.
export const checkinOpensAt=(start:number,early?:number|null)=>Math.min(Number(start)-CHECKIN_LEAD_SECONDS,early?Number(early):Infinity);
export const checkinOpen=(start:number,now:number,early?:number|null)=>now>=checkinOpensAt(start,early);
// «в 13:45» today, «14 ноября в 13:45» on another day, in Kazakhstan time.
export function checkinOpensLabel(start:number,now:number,early?:number|null){
 const at=checkinOpensAt(start,early),part=(v:number,o:Intl.DateTimeFormatOptions)=>dateText(new Date(v*1000),{timeZone:'Asia/Almaty',...o});
 const day=(v:number)=>part(v,{day:'numeric',month:'long'}),time=part(at,{hour:'2-digit',minute:'2-digit'});
 return t('{v}в {time}',{v:(day(at)===day(now)?'':day(at)+' '),time});
}
