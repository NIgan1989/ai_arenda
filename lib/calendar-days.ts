// The calendar of one account as days: what happens on each day, said the way a person reads a diary.
// Kazakhstan keeps one time all year (UTC+5), so a day is cut by a fixed shift and no time zone table is needed.
type Row=Record<string,any>;
const SHIFT=18000,DAY=86400;
export type CalendarTone='stay'|'request'|'cleaning'|'done'|'late';
export type CalendarEntry={key:string;kind:'booking'|'job';id:string;title:string;start:number;end:number;planned:number;tone:CalendarTone;status:string};
export const dayStart=(t:number)=>Math.floor((t+SHIFT)/DAY)*DAY-SHIFT;
const clock=(t:number)=>{const m=Math.floor(((t+SHIFT)%DAY)/60);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
// A confirmed stay whose checkout nobody confirmed and a cleaning nobody accepted still occupy the flat,
// so they run on until now and never silently end at the planned time.
export function calendarEntries(data:Row,role:string,property:string,now:number):CalendarEntry[]{
 const stays:CalendarEntry[]=(data.bookings||[]).filter((b:Row)=>['confirmed','requested','completed'].includes(b.status)&&(!property||b.property_id===property)).map((b:Row)=>{const late=b.status==='confirmed'&&!b.terms?.actual_checkout&&b.end<=now;return {key:'booking:'+b.id,kind:'booking' as const,id:b.id,title:b.title,start:b.start,planned:b.terms?.actual_checkout||b.end,end:b.terms?.actual_checkout||(b.status==='confirmed'?Math.max(b.end,now+1):b.end),tone:late?'late' as const:b.status==='requested'?'request' as const:b.status==='completed'?'done' as const:'stay' as const,status:late?'Выезд не подтверждён':b.status==='requested'?'Заявка ждёт ответа':b.status==='completed'?'Выезд подтверждён':b.terms?.actual_checkin?'Гость заселён':'Бронь подтверждена'};});
 const jobs:CalendarEntry[]=(role==='guest'?[]:data.jobs||[]).filter((j:Row)=>j.status!=='cancelled'&&(!property||j.property_id===property)&&(role!=='cleaner'||j.assigned_to===data.user?.id)).map((j:Row)=>({key:'job:'+j.id,kind:'job' as const,id:j.id,title:j.title,start:j.start,planned:j.end,end:j.status==='completed'?j.end:Math.max(j.end,now+1),tone:j.status==='completed'?'done' as const:'cleaning' as const,status:j.status==='completed'?'Уборка принята':j.status==='submitted'?'Ждёт приёмки':j.status==='in_progress'?'Уборка идёт':j.assigned_to?'Исполнитель назначен':'Нужен исполнитель'}));
 return [...stays,...jobs].sort((a,b)=>a.start-b.start||a.key.localeCompare(b.key));
}
export const entriesOn=(entries:CalendarEntry[],day:number)=>entries.filter(e=>e.start<day+DAY&&e.end>day);
// Six weeks from the Monday on or before the first of the month that holds `day`.
export function monthGrid(day:number){
 const d=new Date((day+SHIFT)*1000),first=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)/1000-SHIFT,weekday=(new Date((first+SHIFT)*1000).getUTCDay()+6)%7;
 return Array.from({length:42},(_,i)=>first+(i-weekday)*DAY);
}
export function shiftMonth(day:number,by:number){const d=new Date((day+SHIFT)*1000);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+by,1)/1000-SHIFT;}
export const sameMonth=(a:number,b:number)=>{const x=new Date((a+SHIFT)*1000),y=new Date((b+SHIFT)*1000);return x.getUTCFullYear()===y.getUTCFullYear()&&x.getUTCMonth()===y.getUTCMonth();};
export const dayNumber=(day:number)=>new Date((day+SHIFT)*1000).getUTCDate();
// What this entry means on this particular day: «Заезд в 14:00», «Выезд до 12:00», «Весь день», «05:05–06:35».
// The planned end is shown on its own day; a stay or a cleaning that runs over it simply takes the following days whole.
export function dayLine(entry:CalendarEntry,day:number){
 const begins=entry.start>=day,ends=entry.planned>day&&entry.planned<=day+DAY;
 if(begins&&ends)return clock(entry.start)+'–'+clock(entry.planned);
 if(entry.kind==='job')return begins?'С '+clock(entry.start):ends?'До '+clock(entry.planned):'Весь день';
 return begins?'Заезд в '+clock(entry.start):ends?'Выезд до '+clock(entry.planned):'Весь день';
}
