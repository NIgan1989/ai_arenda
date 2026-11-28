import {DomainError} from './domain';
import {t} from './i18n';
import {hasContacts} from './listing-rules';
type Row=Record<string,any>;
// The kinds of «Авто» (lib/listings.ts categories.auto), kept here so that lib/listings.ts can check the list on save.
const AUTO=['carwash','tires','carservice','detailing'];
const isAuto=(type:unknown)=>AUTO.includes(String(type||''));

// «Услуги» of a car place (thread «Найти новые виды заведений», 2026-11-28). A car wash, a tyre service, a car service or
// a detailing studio is not taken by the hour: the guest picks a service, it takes its own minutes and costs its own
// price («Комплекс · 60 мин · 6 000 ₸»). The box is held for those minutes; the hour price stays for a booking made
// without a service (an older app). The guest names the car and its number, so the master knows whom to wait for.
export type VenueService={name:string;minutes:number;price:number};
export const MAX_SERVICES=20;
// What a new place of each kind starts with; the owner changes or removes any of it.
export const SERVICE_STARTERS:Record<string,VenueService[]>={
 carwash:[{name:'Кузов',minutes:30,price:3000},{name:'Комплекс',minutes:60,price:6000},{name:'Мойка двигателя',minutes:30,price:4000}],
 tires:[{name:'Переобувка R13–R16',minutes:45,price:8000},{name:'Переобувка R17–R20',minutes:60,price:12000},{name:'Балансировка',minutes:30,price:4000}],
 carservice:[{name:'Диагностика',minutes:60,price:5000},{name:'Замена масла',minutes:30,price:4000},{name:'Развал-схождение',minutes:60,price:8000}],
 detailing:[{name:'Химчистка салона',minutes:180,price:30000},{name:'Полировка кузова',minutes:240,price:40000}],
};
const STEP=15;

/** The services stored with a place, as the guest and the owner see them; none for a place that is not «Авто». */
export function servicesOf(details:unknown):VenueService[]{
 const d=(details&&typeof details==='object'?details:{}) as Row;
 if(!isAuto(d.type)||!Array.isArray(d.services))return [];
 return d.services.filter((s:Row)=>s&&typeof s.name==='string'&&Number(s.minutes)>0&&Number(s.price)>0).map((s:Row)=>({name:String(s.name),minutes:Number(s.minutes),price:Number(s.price)}));
}
/** The owner's list, checked: a name without contacts, minutes in steps of 15 within a working day, a real price. */
export function servicesInput(type:string,raw:unknown):VenueService[]{
 if(!isAuto(type)||raw===undefined||raw===null)return [];
 if(!Array.isArray(raw))throw new DomainError('Услуги передайте списком.');
 if(raw.length>MAX_SERVICES)throw new DomainError('Не больше '+MAX_SERVICES+' услуг.');
 const out:VenueService[]=[],seen=new Set<string>();
 for(const item of raw){
  const s=(item&&typeof item==='object'?item:{}) as Row,name=String(s.name||'').replace(/\s+/g,' ').trim().slice(0,60),minutes=Math.round(Number(s.minutes)),price=Math.round(Number(s.price));
  if(!name)throw new DomainError('Назовите услугу: например, «Комплекс».');
  if(hasContacts(name))throw new DomainError('Уберите из названия услуги телефон и ссылки.');
  if(seen.has(name.toLocaleLowerCase('ru')))throw new DomainError('Услуга «'+name+'» уже есть в списке.');
  if(!Number.isFinite(minutes)||minutes<STEP||minutes>720||minutes%STEP)throw new DomainError('Услуга «'+name+'»: время от 15 минут до 12 часов, шагом 15 минут.');
  if(!Number.isFinite(price)||price<100||price>10000000)throw new DomainError('Услуга «'+name+'»: цена от 100 ₸.');
  seen.add(name.toLocaleLowerCase('ru'));out.push({name,minutes,price});
 }
 return out;
}
/** The service a booking names, by its name; null when the place has no such service. */
export function serviceNamed(details:unknown,name:unknown):VenueService|null{
 const want=String(name||'').trim().toLocaleLowerCase('ru');
 return want?servicesOf(details).find(s=>s.name.toLocaleLowerCase('ru')===want)||null:null;
}
/** «Toyota Camry, 123 ABC 01»: the car a guest brings, short and without contacts. */
export function carInput(raw:unknown):string{
 const car=String(raw||'').replace(/\s+/g,' ').trim().slice(0,60);
 if(car&&hasContacts(car.replace(/\d{3}\s?[A-Za-zА-Яа-я]{2,3}\s?\d{2}/g,'')))throw new DomainError('Укажите только машину и номер, без телефона и ссылок.');
 return car;
}
/** The price of a booking for one service: the service itself, held for its own minutes. */
export function serviceQuote(service:VenueService,start:number,end:number){
 if(end-start!==service.minutes*60)throw new DomainError('Услуга «'+service.name+'» занимает '+minutesWords(service.minutes)+'. Выберите время начала, конец посчитается сам.');
 return {billingMode:'hourly',periods:1,price:service.price,amount:service.price,unitLabel:service.name};
}
/** «45 мин», «1 ч», «1 ч 30 мин». */
export function minutesWords(minutes:number){const h=Math.floor(minutes/60),m=minutes%60;return [h?t('{v} ч',{v:h}):'',m?t('{v} мин',{v:m}):''].filter(Boolean).join(' ');}
/** What the booking keeps of it, one line for the owner and the guest: «Комплекс · Toyota Camry, 123 ABC 01». */
export const serviceLine=(service:VenueService,car:string)=>[service.name,car].filter(Boolean).join(' · ');
