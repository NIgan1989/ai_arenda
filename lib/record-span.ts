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

// A hall's request said in one line beside its sum (audit of 2026-11-22): «Обед · 80 гостей · Свадьба, той».
export function hallLine(item:Record<string,any>){
 if(!isBanquet(item.property_type))return '';
 const evening=((Number(item.start)+18000)%86400)===18*3600,occasion=item.terms?.occasion;
 return [evening?t('Вечер'):t('Обед'),item.guests?t('{n} гостей',{n:item.guests}):'',occasion?(occasion==='other'?t('Банкет'):occasionLabel(occasion)):''].filter(Boolean).join(' · ');
}
