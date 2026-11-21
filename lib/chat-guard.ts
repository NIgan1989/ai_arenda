// What a chat message between a guest and an owner may not carry (offer, the rules of the chat).
// A swindler leads the guest out of the service: a link to «pay here», a card number, a phone for a Kaspi transfer.
// The payout details live only in the booking card (lib/payout.ts), so the chat never carries them:
// - links: never (photos and the map are in the app);
// - a card number: never;
// - a phone number: not before the booking is confirmed; after it, contacts are fine, but not with words about a transfer.
// The same rule runs in the app before sending and on the server.
import {t as tr} from './i18n';

export type ChatGuard={ok:true}|{ok:false;reason:string};

const LINK=/(https?:\/\/|www\.|\b(?:t\.me|wa\.me|vk\.cc|bit\.ly|clck\.ru)\b|\b[a-z0-9-]{2,}\.(?:kz|ru|com|net|org|me|link|site|online|shop|app|io|pro)\b)/i;
const digitsIn=(text:string)=>text.replace(/[^\d]/g,'');
// 16 digits, or 4×4 split by spaces or dashes.
const CARD=/(?:\d[ -]?){15}\d/;
// +7 / 8 and a ten-digit number, spaces, dashes and brackets allowed.
const PHONE=/(?:\+?7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/;
const PAY=/(перевед|переведи|перевести|переводом|предоплат|аванс|задат|оплат|каспи|kaspi|halyk|халык|реквизит|на карту|на номер)/i;

export function chatGuard(text:string,o:{confirmed:boolean}):ChatGuard{
 const t=String(text||'');
 if(LINK.test(t))return {ok:false,reason:'Ссылки в чате брони не отправляются: мошенники уводят по ним оплату мимо сервиса. Фото и адрес есть в карточке брони.'};
 if(CARD.test(t)&&digitsIn(t.match(CARD)![0]).length===16)return {ok:false,reason:'Номер карты в чате не отправляется. Реквизиты для оплаты только в карточке брони.'};
 const phone=PHONE.test(t);
 if(phone&&!o.confirmed)return {ok:false,reason:'Номер телефона откроется после подтверждения брони. До этого пишите здесь, в чате.'};
 if(phone&&PAY.test(t))return {ok:false,reason:'Реквизиты для оплаты только в карточке брони: так гость платит тому, кто прошёл проверку. Номер для перевода в чате не отправляется.'};
 return {ok:true};
}
/** The guest's reminder under the chat. */
export const chatPayNote=()=>tr('Платите только по реквизитам из карточки брони. Если просят перевести на другой номер или по ссылке, нажмите «Есть проблема».');
