import {DomainError} from './domain';
import type {RentalService} from './service';
import {epoch,q,one,type Row} from './operation-core';

// «Реквизиты для оплаты»: where a participant receives transfers. Guests pay owners and owners pay performers
// directly, outside the service; the service only shows these details to the other side of a confirmed deal.
export type Payout={phone:string;recipient:string;link:string};

// A Kazakhstan mobile number in any spelling becomes +7XXXXXXXXXX; anything else is refused.
export function payoutPhone(value:unknown){
 const digits=String(value??'').replace(/\D/g,'');
 const ten=digits.length===11&&(digits[0]==='7'||digits[0]==='8')?digits.slice(1):digits.length===10?digits:'';
 if(!/^7\d{9}$/.test(ten))throw new DomainError('Укажите номер Kaspi в формате +7 7XX XXX XX XX.');
 return '+7'+ten;
}
export const payoutPhoneText=(phone:string)=>/^\+7\d{10}$/.test(phone)?`+7 ${phone.slice(2,5)} ${phone.slice(5,8)} ${phone.slice(8,10)} ${phone.slice(10)}`:phone;
// Only a Kaspi pay link is accepted, so a card of a booking never leads the payer to an unknown site.
export function payoutLink(value:unknown){
 const text=String(value??'').trim();if(!text)return '';
 let url:URL;try{url=new URL(text);}catch{throw new DomainError('Ссылка на оплату должна начинаться с https://pay.kaspi.kz/.');}
 if(url.protocol!=='https:'||!['pay.kaspi.kz','kaspi.kz'].includes(url.hostname)||text.length>300)throw new DomainError('Ссылка на оплату должна начинаться с https://pay.kaspi.kz/.');
 return url.href;
}
export async function payoutOf(db:D1Database,userId:string):Promise<Payout|null>{
 const row=await one(db,"SELECT phone,recipient,link FROM payout_details WHERE user_id=? AND phone<>''",userId);
 return row?{phone:row.phone,recipient:row.recipient,link:row.link}:null;
}
export async function savePayout(service:RentalService,body:Row){
 const phone=payoutPhone(body.phone),recipient=String(body.recipient??'').trim().replace(/\s+/g,' '),link=payoutLink(body.link);
 if(recipient.length<2||recipient.length>60)throw new DomainError('Напишите имя получателя так, как его видит отправитель в Kaspi, например «Айгерим К.».');
 await q(service.db,'INSERT INTO payout_details(user_id,phone,recipient,link,version,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,recipient=excluded.recipient,link=excluded.link,version=version+1,updated_at=excluded.updated_at',service.userId,phone,recipient,link,epoch()).run();
 return {message:'Реквизиты сохранены. Их увидит только тот, кто платит вам по подтверждённой брони или принятой уборке.',payout:{phone,recipient,link}};
}
