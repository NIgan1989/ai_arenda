import {forms,t} from './i18n';
type Row=Record<string,any>;

// «Запись и живая очередь» of a car place (thread «Совместить запись и живую очередь автомоек», 2026-11-28).
// Many car washes keep one box for bookings and the rest for cars that simply come and wait. The owner says how many
// boxes take bookings: those are the first boxes of the card (lib/room-units.ts roomsOf), the rest are the queue. The
// person on shift marks each box with one tap («Машина заехала», «Бокс свободен») and the cars waiting with «Ждут ±»;
// the guest sees the real load from those taps, and nothing when nobody has tapped for a while. A self-service wash has
// no bookings at all and, without anyone on site, shows its posts and hours and no load unless an operator marks it.
export const LATE_CHOICES=[5,10,15,20,30];
export const MAX_WAITING=99;
/** Without taps the load is not shown: half an hour at a staffed wash, an hour at a self-service one. */
export const STALE_SECONDS=1800,SELF_STALE_SECONDS=3600;
// instant: a booking at a free time is confirmed at once; off, it is a request and the owner or the admin confirms it
// or names another time (when the calendar cannot know what is free: cars that came without booking).
// showLoad: the guest sees the load of the queue; then the service asks the person on shift about each box in turn.
export type BayPlan={selfService:boolean;booked:number;lateMinutes:number;instant:boolean;showLoad:boolean};

/** How a card of `total` boxes is run: by default every box takes bookings, as before the queue existed. */
export function bayPlan(details:unknown,total:number):BayPlan{
 const d=(details&&typeof details==='object'?details:{}) as Row,self=d.selfService===true,raw=Number(d.bookedBays);
 const booked=self?0:d.bookedBays===undefined||d.bookedBays===null||!Number.isFinite(raw)?total:Math.max(0,Math.min(total,Math.floor(raw)));
 return {selfService:self,booked,lateMinutes:LATE_CHOICES.includes(Number(d.lateMinutes))?Number(d.lateMinutes):10,instant:d.instantConfirm!==false,showLoad:d.showLoad!==false};
}
/** What the owner's form may store of it (lib/listings.ts listingInput). */
export function bayInput(details:Row):Row{
 const raw=Number(details.bookedBays),out:Row={};
 if(details.selfService===true)out.selfService=true;
 else if(details.bookedBays!==undefined&&details.bookedBays!==null&&details.bookedBays!==''&&Number.isFinite(raw))out.bookedBays=Math.max(0,Math.min(200,Math.floor(raw)));
 if(LATE_CHOICES.includes(Number(details.lateMinutes)))out.lateMinutes=Number(details.lateMinutes);
 if(details.instantConfirm===false)out.instantConfirm=false;
 if(details.showLoad===false)out.showLoad=false;
 return out;
}
/** The wait for a car that comes now: none while a queue box is free for it, else its turn over the open boxes. */
export function waitMinutes(free:number,waiting:number,open:number,avg:number){
 if(open<=0)return 0;
 const ahead=waiting-free;
 return ahead<0?0:Math.max(5,Math.round(avg*(ahead+1)/open/5)*5);
}
/** A rolling average of a wash, from the minutes a box was busy; a tap left on for hours does not count. */
export function nextAverage(old:number|null|undefined,minutes:number){
 if(!(minutes>=3&&minutes<=240))return old||null;
 return old?Math.round(old*0.7+minutes*0.3):Math.round(minutes);
}
export type BayLoad={total:number;booked:number;queue:number;open:number;free:number;waiting:number;waitMinutes:number;next:number|null;known:boolean;stale:boolean;selfService:boolean;working:boolean;shown?:boolean};

const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
/** The guest's lines of a car place: what is free now, the queue, the next booking. Empty when it is closed now. */
export function bayLines(l:BayLoad|null|undefined):string[]{
 if(!l)return [];
 const out:string[]=[];
 if(l.selfService)out.push(t(forms(l.total,'Самообслуживание · {n} пост','Самообслуживание · {n} поста','Самообслуживание · {n} постов'),{n:l.total}));
 if(!l.working)return out;
 if(l.queue>0){
  if(l.shown===false){if(!l.selfService)out.push(t('Живая очередь, без записи'));}
  else if(l.stale){if(!l.selfService)out.push(t('Загрузка не обновлялась'));}
  else if(l.known)out.push(l.free>0&&l.waiting<l.free?t('Свободно сейчас: {free} из {open}',{free:l.free,open:l.open}):l.waiting?t('Очередь ~{m} мин · ждут {n}',{m:l.waitMinutes,n:l.waiting}):t('Очередь ~{m} мин',{m:l.waitMinutes}));
 }
 if(l.booked>0)out.push(l.next?t('По записи: ближайшее {v}',{v:clock(l.next)}):t('По записи: сегодня мест нет'));
 return out;
}
/** A card that takes no bookings: the guest just comes. */
export const queueOnly=(l:BayLoad|null|undefined)=>!!l&&l.booked===0;
