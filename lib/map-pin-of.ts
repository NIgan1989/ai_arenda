// The pin of one thing on the site's map, as the app draws it (mobile/src/MapPins.tsx): a «таблетка» with a label and a
// state colour. The site's maps pass rows of their own (flats, bookings, cleanings, a guest's matches); a row may already
// say how its pin looks (pinTone, pinLabel, pinUntil, pinProgress, pinOrder), otherwise it is read from the row the way the
// circles of the site's map read it before. Pure, covered by tests/map-pin-of.test.mjs.
import type {PinState,PinTone} from '../mobile/src/map-motion';
import type {AiMove} from './ai-move-marks';

type Row=Record<string,any>;
export type WebPin={key:string;point:[number,number];label:string;tone:PinTone;title:string;until?:number;progress?:number;best?:boolean;order?:number;was?:PinState;ai?:{move:AiMove;at:number}};
const TONES:PinTone[]=['home','pending','offer','job','booking','booked','active','alert'];

// 18 000 → «18 тыс.», 9 500 → «9 500 ₸», as the app's price pins.
export function shortPrice(amount:unknown){
 const n=Number(amount);
 if(!Number.isFinite(n)||n<=0)return '';
 return n>=10000?Math.round(n/1000)+' тыс.':new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g,' ')+' ₸';
}

export function pinOf(item:Row):WebPin|null{
 const lon=Number(item?.location?.longitude),lat=Number(item?.location?.latitude);
 if(!item?.mapKey||!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return null;
 const kind=item.kind||'property';
 const price=shortPrice(item.estimate?.amount??item.mapPrice??item.price);
 // A guest's match: yellow while the owner is asked, indigo once the owner said yes.
 const tone:PinTone=TONES.includes(item.pinTone)?item.pinTone:item.matchPending===true?'pending':item.ownerConfirmed===true?'offer':kind==='job'?'job':kind==='booking'?'booking':'home';
 const label=String(item.pinLabel||(tone==='pending'&&kind==='property'?'Запрос':kind==='job'?'Уборка':kind==='booking'?'Заезд':price||'Объект'));
 const until=Number(item.pinUntil??item.askExpiresAt);
 return {
  key:String(item.mapKey),point:[lon,lat],label,tone,title:String(item.title||label),
  ...(tone==='pending'&&until>0?{until}:{}),
  ...(typeof item.pinProgress==='number'?{progress:Math.max(0,Math.min(1,item.pinProgress))}:{}),
  ...(item.pinBest===true||item.match?.best===true?{best:true}:{}),
  ...(Number(item.pinOrder)>0?{order:Number(item.pinOrder)}:{}),
  // What the AI administrator just did here (lib/ai-move-marks.ts): the pin plays its sign once.
  ...(item.pinAi&&typeof item.pinAi.move==='string'&&Number(item.pinAi.at)>0?{ai:{move:item.pinAi.move,at:Number(item.pinAi.at)}}:{})
 };
}
export function pinsOf(items:Row[]):WebPin[]{
 return items.map(pinOf).filter((p):p is WebPin=>!!p);
}
