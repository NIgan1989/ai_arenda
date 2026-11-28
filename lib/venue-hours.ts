import {DomainError} from './domain';
import {isBanquet,isBath} from './listings';
import {t} from './i18n';
type Row=Record<string,any>;

// «Время работы» of a place that is not a home (thread «Не назначать уборки на ночь», 2026-11-28): every hall, cafe,
// bath and sauna sets its own hours, and a hall its own times of events. Nothing is fixed by the service any more:
// a той today runs from about 15:00 to midnight, a memorial meal from 12:00 in sittings of an hour and a half with
// half an hour to get the hall ready, a bath in Pavlodar is often open round the clock.
// Minutes of the day, Kazakhstan time; `to` 1440 is midnight. A close before the open runs past midnight.
export type Session={label:string;from:number;to:number};
export type VenueHours={open:number;close:number;sessions:Session[]};
const OFFSET=18000,DAY=86400;
const hall=(label:string,from:string,to:string):Session=>({label,from:mm(from),to:mm(to)});
export function mm(v:string){const m=/^(\d{1,2}):(\d{2})$/.exec(String(v).trim());if(!m)throw new DomainError('Время укажите как ЧЧ:ММ.');const h=Number(m[1]),n=Number(m[2]);if(h>24||n>59||(h===24&&n>0))throw new DomainError('Время укажите как ЧЧ:ММ.');return h*60+n;}
export const hhmm=(v:number)=>v>=1440?'24:00':String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');

// What a new hall starts with; the owner changes any of it. «Днём» and «Вечер» are the old two slots, kept so that
// a booking made from an older app still finds its time.
export const HALL_DEFAULT:VenueHours={open:600,close:1440,sessions:[
 hall('Поминки, 1-й заход','12:00','13:30'),hall('Поминки, 2-й заход','14:00','15:30'),hall('Поминки, 3-й заход','16:00','17:30'),
 hall('Той','15:00','24:00'),hall('Днём','12:00','17:00'),hall('Вечер','18:00','24:00')]};
export const BATH_DEFAULT:VenueHours={open:0,close:1440,sessions:[]};
export const roundTheClock=(h:VenueHours)=>h.open===0&&h.close===1440||h.open===h.close;

export function venueDefault(kind?:string):VenueHours|null{return isBanquet(kind)?HALL_DEFAULT:isBath(kind)?BATH_DEFAULT:null;}
// The hours stored for a place, or its kind's default.
export function venueHours(kind:string|undefined,stored:unknown):VenueHours|null{
 const base=venueDefault(kind);if(!base)return null;
 if(typeof stored!=='string'||!stored)return base;
 try{const v=JSON.parse(stored);return {open:Number(v.open)||0,close:Number(v.close)||1440,sessions:isBanquet(kind)&&Array.isArray(v.sessions)?v.sessions.map((s:Row)=>({label:String(s.label),from:Number(s.from),to:Number(s.to)})):[]};}catch{return base;}
}
// What the owner sends («Время работы» in mobile/src/VenueHours.tsx), checked and stored as text.
export function venueHoursInput(kind:string|undefined,body:unknown):string{
 if(!venueDefault(kind))return '';
 const v=(body&&typeof body==='object'?body:{}) as Row;
 const open=mm(String(v.open??'00:00')),close=mm(String(v.close??'24:00'));
 const sessions:Session[]=[];
 if(isBanquet(kind)){
  const list=Array.isArray(v.sessions)?v.sessions:[];
  if(!list.length)throw new DomainError('Добавьте хотя бы одно время мероприятия.');
  if(list.length>12)throw new DomainError('Не больше 12 времён мероприятий.');
  for(const s of list){
   const label=String(s?.label||'').trim().slice(0,40),from=mm(String(s?.from)),to=mm(String(s?.to));
   if(!label)throw new DomainError('Назовите время мероприятия: например, «Той» или «Поминки, 1-й заход».');
   if(to<=from)throw new DomainError('Мероприятие «'+label+'» должно заканчиваться позже начала, не позже 24:00.');
   if(to-from<60)throw new DomainError('Мероприятие «'+label+'» короче часа.');
   if(!within({open,close,sessions:[]},from,to))throw new DomainError('Мероприятие «'+label+'» выходит за время работы зала.');
   sessions.push({label,from,to});
  }
  sessions.sort((a,b)=>a.from-b.from||a.to-b.to);
 }
 return JSON.stringify({open,close,sessions});
}
// A span of minutes of one day fits the working hours (a close before the open runs past midnight).
function within(h:VenueHours,from:number,to:number){
 if(roundTheClock(h))return true;
 const close=h.close>h.open?h.close:h.close+1440;
 return from>=h.open&&to<=close||from+1440>=h.open&&to+1440<=close;
}
const minuteOf=(t:number)=>Math.floor(((t+OFFSET)%DAY+DAY)%DAY/60);
// The session a hall booking takes: its start and length match one of the hall's times.
export function sessionAt(h:VenueHours,start:number,end:number){const from=minuteOf(start),length=(end-start)/60;return h.sessions.find(s=>s.from===from&&s.to-s.from===length)||null;}
// A bath booking keeps inside the hours: from the open to the close of the same working day.
export function fitsHours(h:VenueHours,start:number,end:number){
 if(roundTheClock(h))return true;
 const from=minuteOf(start),length=Math.round((end-start)/60);
 return within(h,from,from+length);
}
export const hoursLine=(h:VenueHours)=>roundTheClock(h)?t('Круглосуточно'):t('с {from} до {to}',{from:hhmm(h.open),to:hhmm(h.close)});
export const sessionLine=(s:Session)=>t(s.label)+' '+hhmm(s.from)+'–'+hhmm(s.to);
// The words of a refused time, with what the place does take.
export function hallTimesText(h:VenueHours){return t('Зал принимает мероприятия: {list}.',{list:h.sessions.map(sessionLine).join(', ')});}
export function bathHoursText(h:VenueHours){return t('Это место работает {v}. Выберите время внутри него.',{v:hoursLine(h)});}
// One line for the owner's card: a bath's hours, a hall's times of events.
export function venueSummary(kind:string|undefined,stored:unknown){const h=venueHours(kind,stored);if(!h)return '';return isBanquet(kind)?h.sessions.map(sessionLine).join(', '):hoursLine(h);}
