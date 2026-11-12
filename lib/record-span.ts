// When a booking or a cleaning happens, said once and short, in Kazakhstan time:
// «13 ноября, 03:05–05:05» inside one day, «13 ноября, 14:00 → 15 ноября, 12:00» across days.
const part=(v:number,options:Intl.DateTimeFormatOptions)=>new Date(v*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',...options});
export function recordSpan(start:number,end?:number){
 if(!start)return '—';
 const day=(v:number)=>part(v,{day:'numeric',month:'long'}),time=(v:number)=>part(v,{hour:'2-digit',minute:'2-digit'});
 if(!end)return day(start)+', '+time(start);
 return day(start)===day(end)?day(start)+', '+time(start)+'–'+time(end):day(start)+', '+time(start)+' → '+day(end)+', '+time(end);
}
