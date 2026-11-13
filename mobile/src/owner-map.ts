// What the owner's live map says about each of his objects, in one short label on its pin.
// Pure functions, covered by mobile/tests/owner-map.test.mjs. Times are Kazakhstan time (UTC+5).
import type {PinTone} from './map-motion';

type Row=Record<string,any>;
export type OwnerPin={label:string;tone:PinTone;best?:boolean;progress?:number};
const ZONE=5*3600;
const clock=(at:number)=>{const d=new Date((at+ZONE)*1000);return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');};
const day=(at:number)=>Math.floor((at+ZONE)/86400);
// «14:00» today, «завтра 12:00» tomorrow; anything later is not a status of now.
export function soon(at:number,now:number){const d=day(at)-day(now);return d===0?clock(at):d===1?'завтра '+clock(at):'';}
// 11 000 → «11 тыс.», 9 500 → «9 500 ₸»; a price change reads «11 → 13 тыс.».
export function thousands(amount:number){return amount>=10000?Math.round(amount/1000)+' тыс.':amount.toLocaleString('ru-RU').replace(/\s/g,' ')+' ₸';}
export function priceChange(from:number,to:number){return from>=10000&&to>=10000?Math.round(from/1000)+' → '+Math.round(to/1000)+' тыс.':thousands(from)+' → '+thousands(to);}

// The most urgent thing about the object wins: cleaning under way, a departure not confirmed, a guest inside, a report to accept, a request,
// an arrival or a cleaning within a day; otherwise its price, or the AI's price advice with the AI ring.
export function ownerPin(property:Row,processes:Row[],now:number,advice?:{from:number;to:number}|null):OwnerPin{
 const mine=processes.filter(p=>p.propertyId===property.id),of=(kind:string,...status:string[])=>mine.filter(p=>p.kind===kind&&status.includes(p.status)).sort((a,b)=>Number(a.start)-Number(b.start));
 // Cleaning under way fills a strip on the pin, from its start to the end of its window (see cleaner-map.ts).
 const working=of('job','in_progress')[0];if(working){const a=Number(working.startedAt),b=Number(working.end);return {label:'Уборка идёт',tone:'active',...(a>0&&b>a?{progress:Math.max(0,Math.min(1,(now-a)/(b-a)))}:{})};}
 // A stay past its end without a confirmed departure still needs the owner: the map keeps it until the checkout is confirmed.
 if(of('booking','confirmed').some(b=>Number(b.start)<=now&&now>=Number(b.end)))return {label:'Выезд не подтверждён',tone:'pending'};
 const inside=of('booking','confirmed').find(b=>Number(b.start)<=now&&now<Number(b.end));if(inside)return {label:'Гость до '+(soon(Number(inside.end),now)||clock(Number(inside.end))),tone:'booking'};
 if(of('job','submitted')[0])return {label:'Уборка на приёмке',tone:'job'};
 if(of('booking','requested')[0])return {label:'Заявка',tone:'pending'};
 const arrival=of('booking','confirmed').find(b=>Number(b.start)>now&&soon(Number(b.start),now));if(arrival)return {label:'Заезд '+soon(Number(arrival.start),now),tone:'booking'};
 const cleaning=of('job','open','assigned').find(j=>soon(Number(j.start),now));if(cleaning)return {label:'Уборка '+soon(Number(cleaning.start),now),tone:'job'};
 const price=Number(property.price);
 if(advice&&advice.from>0&&advice.to>0&&advice.from!==advice.to)return {label:priceChange(advice.from,advice.to),tone:'home',best:true};
 return {label:price>0?thousands(price):'Жильё',tone:'home'};
}

// The people on their way, as the server shares them: only with a fresh point.
export function travellers(journeys:Row[]):{key:string;point:[number,number];label:string}[]{
 return journeys.flatMap(j=>typeof j.longitude==='number'&&typeof j.latitude==='number'&&Number.isFinite(j.longitude)&&Number.isFinite(j.latitude)?[{key:'journey:'+j.id,point:[Number(j.longitude),Number(j.latitude)] as [number,number],label:j.kind==='job'?'Исполнитель в пути':'Гость в пути'}]:[]);
}
