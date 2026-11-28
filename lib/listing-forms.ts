import {t as tr} from './i18n';
// «Формы под каждый тип» (thread of 2026-11-28): adding a place starts with its kind, then shows a form of that kind
// only. What each kind adds on top of the common listing — the room types of a hotel, the halls of a banquet hall, the
// fields or tables alike of a sport place, the boxes and services of a car place, the hours of every place taken by
// the hour — is filled right in the form, not later in the editor. The screen is mobile/src/PropertyQuick.tsx.
import {isAuto,isBanquet,isHourlyVenue,isVenue,kindCategory,roomKinds,unitKinds} from './listings';
import {SERVICE_STARTERS,type VenueService} from './venue-services';
import {venueHours,hhmm} from './venue-hours';
import {draftListingBody,draftTitle,type ListingDraft} from './listing-draft';
type Row=Record<string,any>;

/** The forms: a home, a place sold by the room, a bath, a hall, a place taken by the hour, a car place. */
export type FormKind='stay'|'rooms'|'bath'|'hall'|'hourly'|'auto';
export function formKind(type?:string):FormKind{
 if(roomKinds.includes(type||''))return 'rooms';
 const c=kindCategory(type);
 return c==='bath'?'bath':c==='banquet'?'hall':c==='auto'?'auto':c==='leisure'||c==='sport'?'hourly':'stay';
}

export type RoomType={name:string;count:number;capacity:number;price:number};
export type Hall={name:string;capacity:number};
export type Hours={open:string;close:string;sessions:{label:string;from:string;to:string}[]};
/** What a kind adds to the common listing. */
export type FormExtras={type:string;roomTypes:RoomType[];halls:Hall[];units:number;services:VenueService[];bookedBays:number;selfService:boolean;hours:Hours|null;menu:string};
export const MAX_ROOM_TYPES=10,MAX_HALLS=12,MAX_UNITS=200;

/** The start of a kind's form, from what the story told: one room type, one hall, the usual services and hours.
 * The same kind keeps what the owner already filled; another kind starts its own form. */
export function startExtras(d:ListingDraft,prev?:FormExtras|null):FormExtras{
 if(prev&&prev.type===d.type)return prev;
 const h=venueHours(d.type,undefined);
 return {type:d.type,
  roomTypes:[{name:d.type==='hostel'?tr('Место в общем номере'):tr('Стандарт'),count:1,capacity:d.type==='hostel'?1:Math.max(1,d.capacity),price:d.price}],
  halls:[{name:tr('Основной зал'),capacity:Math.max(1,d.capacity)}],
  units:1,services:SERVICE_STARTERS[d.type]||[],bookedBays:1,selfService:false,
  hours:h?{open:hhmm(h.open),close:hhmm(h.close),sessions:h.sessions.map(s=>({label:s.label,from:hhmm(s.from),to:hhmm(s.to)}))}:null,
  menu:''};
}

/** What still has to be filled, in the order of the form: step 1 is the kind's form, step 2 the address. */
export function missingFields(d:ListingDraft,x:FormExtras):{step:1|2;label:string}[]{
 const out:{step:1|2;label:string}[]=[],form=formKind(d.type);
 if(form==='rooms'){
  if(x.roomTypes.some(r=>!r.name.trim()))out.push({step:1,label:tr('Название номера')});
  if(x.roomTypes.some(r=>!(r.price>=100)))out.push({step:1,label:tr('Цена номера')});
 }else if(form==='hall'){
  if(x.halls.some(h=>!h.name.trim()))out.push({step:1,label:tr('Название зала')});
  if(!(d.price>=100))out.push({step:1,label:tr('Цена на гостя')});
 }else if(form==='auto'){
  if(!x.services.length||x.services.some(s=>!s.name.trim()||!(s.price>=100)))out.push({step:1,label:tr('Услуги и цены')});
 }else if(isHourlyVenue(d.type)){if(!(d.hourlyPrice>=100))out.push({step:1,label:tr('Цена за час')});}
 else if(!(d.price>=100))out.push({step:1,label:tr('Цена за сутки')});
 if(!d.ownStaff&&!(d.cleaningFee>=100))out.push({step:1,label:tr('Цена уборки')});
 if(!String(d.address||'').trim())out.push({step:2,label:tr('Адрес')});
 if(!String(d.district||'').trim())out.push({step:2,label:tr('Район')});
 return out;
}

/** One card to save and what follows it: how many alike it stands for. */
export type CardPlan={body:Row;units:number};
/** The cards the form saves: a hotel one per room type, every other kind one; a hall's further halls come after. */
export function formPlan(d:ListingDraft,x:FormExtras,photos:string[],published:boolean):{cards:CardPlan[];halls:{name:string;body:Row}[];venueTitle:string}{
 const form=formKind(d.type),title=draftTitle(d);
 const withExtras=(body:Row):Row=>{
  const details={...body.details},rental={...body.rental};
  if(isAuto(d.type)){details.services=x.services.map(s=>({...s,name:s.name.trim()}));if(x.selfService)details.selfService=true;else details.bookedBays=Math.max(0,Math.min(x.units,x.bookedBays));}
  if(isBanquet(d.type)&&x.menu.trim())details.menu=x.menu.trim().slice(0,1500);
  if(isVenue(d.type)&&x.hours)rental.venueHours=x.hours;
  return {...body,details,rental};
 };
 if(form==='rooms')return {cards:x.roomTypes.map(r=>{const named=x.roomTypes.length>1||r.name.trim()!==tr('Стандарт');
  return {body:withExtras(draftListingBody({...d,title:named?title+' · '+r.name.trim():d.title,capacity:r.capacity,beds:Math.max(r.capacity,1),price:r.price,rooms:1},photos,published)),units:Math.max(1,Math.min(MAX_UNITS,r.count))};}),halls:[],venueTitle:''};
 if(form==='hall'){const [first,...rest]=x.halls,hall=(h:Hall,name:string)=>withExtras(draftListingBody({...d,title:name,capacity:h.capacity,beds:Math.max(d.beds,h.capacity)},photos,published));
  return {cards:[{body:hall(first,rest.length?title+' · '+first.name.trim():d.title),units:1}],halls:rest.map(h=>({name:h.name.trim(),body:hall(h,h.name.trim())})),venueTitle:title};}
 return {cards:[{body:withExtras(draftListingBody(d,photos,published)),units:unitKinds.includes(d.type)?Math.max(1,Math.min(MAX_UNITS,x.units)):1}],halls:[],venueTitle:''};
}
