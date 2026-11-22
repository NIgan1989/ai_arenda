// What a chat message between a guest and an owner may not carry (offer, the rules of the chat).
// A swindler leads the guest out of the service: a link to «pay here», a card number, a phone for a Kaspi transfer.
// The payout details live only in the booking card (lib/payout.ts), so the chat never carries them:
// - links: never (photos and the map are in the app);
// - a card number: never;
// - a phone number, a messenger or a @nick: not before the phone opens (a day before the check-in of a confirmed
//   booking, phoneOpens); after it, contacts are fine, but not with words about a transfer.
// Why a day and not the confirmation: a confirmed booking is cancelled for free, and a phone given at once lets the two
// agree in WhatsApp and cancel the booking, so the service is left out (2026-11-22). The address still opens at once.
import {t as tr} from './i18n';

export type ChatGuard={ok:true}|{ok:false;reason:string};

const LINK=/(https?:\/\/|www\.|\b(?:t\.me|wa\.me|vk\.cc|bit\.ly|clck\.ru)\b|\b[a-z0-9-]{2,}\.(?:kz|ru|com|net|org|me|link|site|online|shop|app|io|pro)\b)/i;
const digitsIn=(text:string)=>text.replace(/[^\d]/g,'');
// 16 digits, or 4×4 split by spaces or dashes.
const CARD=/(?:\d[ -]?){15}\d/;
// +7 / 8 and a ten-digit number, spaces, dashes and brackets allowed.
const PHONE=/(?:\+?7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/;
// The same number with every digit apart, or with dots: «8 7 0 1 1 2 3 4 5 6 7», «8.701.123.45.67».
const SPACED=/\d[\d\s\-().]{8,}\d/g;
function spacedPhone(text:string){
 for(const m of text.match(SPACED)||[]){const d=digitsIn(m);if(d.length===11&&/^[78]7/.test(d)||d.length===10&&d[0]==='7')return true;}
 return false;
}
// «Пишите в WhatsApp», «мой телеграм», «@nick»: a way to talk outside the service.
const MESSENGER=/(whats\s?app|ватс\s?ап|вотс\s?ап|вацап|вотсап|ватсапп|telegram|телеграм|телеграмм|телегу|instagram|инстаграм|инсту|viber|вайбер|\B@[a-z0-9_.]{3,})/i;
const PAY=/(перевед|переведи|перевести|переводом|предоплат|аванс|задат|оплат|каспи|kaspi|halyk|халык|реквизит|на карту|на номер)/i;

export const PHONE_OPENS=86400;
/** The phone of the other side opens for a confirmed booking a day before the check-in (and stays open after it). */
export function phoneOpens(b:{status?:string;start?:number}|null|undefined,t=Math.floor(Date.now()/1000)){
 if(!b)return false;
 if(b.status==='completed')return true;
 return b.status==='confirmed'&&t>=Number(b.start)-PHONE_OPENS;
}
export function chatGuard(text:string,o:{phoneOpen:boolean}):ChatGuard{
 const t=String(text||'');
 if(LINK.test(t))return {ok:false,reason:'Ссылки в чате брони не отправляются: мошенники уводят по ним оплату мимо сервиса. Фото и адрес есть в карточке брони.'};
 if(CARD.test(t)&&digitsIn(t.match(CARD)![0]).length===16)return {ok:false,reason:'Номер карты в чате не отправляется. Реквизиты для оплаты только в карточке брони.'};
 const phone=PHONE.test(t)||spacedPhone(t);
 if(phone&&!o.phoneOpen)return {ok:false,reason:'Номер телефона откроется за сутки до заезда. До этого пишите здесь, в чате: так бронь под защитой сервиса.'};
 if(!o.phoneOpen&&MESSENGER.test(t))return {ok:false,reason:'Мессенджеры и ники откроются за сутки до заезда. До этого пишите здесь, в чате: так бронь под защитой сервиса.'};
 if(phone&&PAY.test(t))return {ok:false,reason:'Реквизиты для оплаты только в карточке брони: так гость платит тому, кто прошёл проверку. Номер для перевода в чате не отправляется.'};
 return {ok:true};
}
/** The guest's reminder under the chat. */
export const chatPayNote=()=>tr('Платите только по реквизитам из карточки брони. Если просят перевести на другой номер или по ссылке, нажмите «Есть проблема».');
