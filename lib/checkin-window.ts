// A guest can say «Я заселился», and the owner can confirm the check-in, only from 15 minutes before the agreed
// check-in time: earlier the place may still be occupied or being cleaned. The same rule holds on the site, in the app
// and on the server.
export const CHECKIN_LEAD_SECONDS=15*60;
export const checkinOpensAt=(start:number)=>Number(start)-CHECKIN_LEAD_SECONDS;
export const checkinOpen=(start:number,now:number)=>now>=checkinOpensAt(start);
// «в 13:45» today, «14 ноября в 13:45» on another day, in Kazakhstan time.
export function checkinOpensLabel(start:number,now:number){
 const at=checkinOpensAt(start),part=(v:number,o:Intl.DateTimeFormatOptions)=>new Date(v*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',...o});
 const day=(v:number)=>part(v,{day:'numeric',month:'long'}),time=part(at,{hour:'2-digit',minute:'2-digit'});
 return (day(at)===day(now)?'':day(at)+' ')+'в '+time;
}
