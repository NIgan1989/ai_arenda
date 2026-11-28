import {dateText,t} from './i18n';
import {isBanquet,occasionLabel} from './listings';
// When a booking or a cleaning happens, said once and short, in Kazakhstan time:
// «13 ноября, 03:05–05:05» inside one day, «13 ноября, 14:00 → 15 ноября, 12:00» across days.
const part=(v:number,options:Intl.DateTimeFormatOptions)=>dateText(v*1000,{timeZone:'Asia/Almaty',...options});
export function recordSpan(start:number,end?:number){
 if(!start)return '—';
 const day=(v:number)=>part(v,{day:'numeric',month:'long'}),time=(v:number)=>part(v,{hour:'2-digit',minute:'2-digit'});
 if(!end)return day(start)+', '+time(start);
 return day(start)===day(end)?day(start)+', '+time(start)+'–'+time(end):day(start)+', '+time(start)+' → '+day(end)+', '+time(end);
}

// A hall's request said in one line beside its sum (audit of 2026-11-22): «15:00–24:00 · 80 гостей · Свадьба, той»;
// each hall has its own times of events (lib/venue-hours.ts), so the time is said by the clock.
export function hallLine(item:Record<string,any>){
 // A car place says its service and the car instead («Комплекс · Toyota Camry, 123 ABC 14»).
 if(item.terms?.service)return String(item.terms.service);
 if(!isBanquet(item.property_type))return '';
 const clock=(v:number)=>{const m=Math.round(((v+18000)%86400)/60);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');},end=clock(Number(item.end)),occasion=item.terms?.occasion;
 return [clock(Number(item.start))+(item.end?'–'+(end==='00:00'?'24:00':end):''),item.guests?t('{n} гостей',{n:item.guests}):'',occasion?(occasion==='other'?t('Банкет'):occasionLabel(occasion)):''].filter(Boolean).join(' · ');
}
