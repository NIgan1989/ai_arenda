import type {RentalService} from './service';
import {redactAIText,type AIConfig} from './ai';
import {askModelJSON,modelReady} from './ai-json';
import {amenities,checkinMethods,kindLabel} from './listings';
import type {Row} from './operation-core';

// The AI administrator answers a guest in the booking chat with the model, from the booking's own facts.
// The model only picks one of three ready outcomes: answer from the facts, say nothing (the guest just
// told something), or hand the question to the owner. It never sees the address, keys, codes or contacts,
// and it never changes the booking: dates, prices and refunds stay with the buttons and the owner.
export type GuestFacts=Row;
export type GuestModelAnswer={reply:string;handoff:boolean};
export type GuestModel=(facts:GuestFacts,history:{from:string;text:string}[],text:string)=>Promise<GuestModelAnswer|null>;

const schema={type:'object',properties:{
 reply:{type:'string',description:'Ответ гостю от имени ИИ-администратора или пустая строка, если ответ не нужен.'},
 handoff:{type:'boolean',description:'true, если ответа нет в фактах и вопрос нужно передать владельцу.'}
},required:['reply','handoff'],additionalProperties:false};

const instructions=`Ты ИИ-администратор сервиса аренды жилья на часы и сутки в Казахстане. Владелец доверил тебе переписку с гостем в чате брони.
Отвечай только по фактам из блока «Факты брони». Ничего не придумывай: если ответа в фактах нет, честно скажи, что передал вопрос владельцу, и верни handoff=true.
Всегда передавай владельцу (handoff=true): ключи, коды, домофон, пароль Wi-Fi, точное место встречи, особые просьбы, поломки и жалобы, скидки, возвраты, любые договорённости сверх правил.
Не обещай изменений брони. Ранний заезд, поздний выезд и продление оформляются кнопкой «Изменить даты или продлить» в карточке брони. О поломке или проблеме гость может нажать «Есть проблема» в карточке брони.
Адрес не называй: если спрашивают, скажи, где его посмотреть (поле addressNote).
Если гость просто сообщает что-то, на что не нужно отвечать («едем», «уже на месте», «ок»), верни пустой reply и handoff=false.
Пиши коротко, вежливо, 1–3 предложения, на языке гостя (русский или казахский), без приветствия, если гость не здоровался. Не упоминай, что ты модель, и не пиши о «фактах».`;

const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
const when=(t:number)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(t*1000));
const statusText:Record<string,string>={requested:'заявка ждёт подтверждения',confirmed:'бронь подтверждена',completed:'проживание завершено'};
const paymentText:Record<string,string>={unpaid:'не оплачено',pending:'оплата ещё не подтверждена',owner_verified:'оплачено'};

/** What the model may know about one booking: no address, no contacts, no access, no other people. */
export function guestFacts(b:Row,details:Row={}):GuestFacts{
 return {
  kind:kindLabel(details.type),title:redactAIText(clean(b.title,120)),status:statusText[b.status]||b.status,
  checkin:when(b.start),checkout:when(b.end),guestsInBooking:b.guests,capacity:b.capacity,
  amount:b.amount+' ₸',payment:paymentText[b.payment_status]||'смотрите карточку брони',
  deposit:b.deposit>0?b.deposit+' ₸, '+(b.deposit_status==='owner_verified'?'получен':'передаётся при заезде')+', возвращается после выезда и проверки':'не требуется',
  addressNote:b.status==='confirmed'?'точный адрес и маршрут в карточке брони':'адрес появится в карточке брони после подтверждения',
  checkinMethod:checkinMethods[details.checkinMethod]||'уточняет владелец',
  amenities:(Array.isArray(details.amenities)?details.amenities:[]).map((a:string)=>amenities[a]).filter(Boolean),
  ...(details.menu?{menu:redactAIText(clean(details.menu,800))}:{}),
  houseRules:redactAIText(clean(b.house_rules,800))||'владелец не указал особых правил',
  description:redactAIText(clean(b.description,1200)),
  // «Жильё проверено» only when a person at the platform checked the owner's document of the right to let it.
  checked:b.verified?'Жильё проверено: сервис сверил документ владельца о праве сдавать':'Жильё не проверено: сервис не сверял документ о праве владельца сдавать; гость бронирует на свой риск, платить только по реквизитам в карточке брони',
 };
}

/** The guest's own permission, limits and budget apply: it is the guest's text that leaves the service. */
export function guestModel(s:RentalService,config:AIConfig):GuestModel|undefined{
 if(!modelReady(config))return undefined;
 return async(facts,history,text)=>{
  const input=[...history.slice(-6).map(m=>({role:m.from==='guest'?'user' as const:'assistant' as const,content:redactAIText(clean(m.text,600))})),{role:'user' as const,content:redactAIText(clean(text,1500))}];
  const parsed=await askModelJSON(s.db,s.userId,config,{name:'guest_answer',instructions:instructions+'\n\nФакты брони:\n'+JSON.stringify(facts),input,schema});
  if(!parsed||typeof parsed.handoff!=='boolean'||typeof parsed.reply!=='string')return null;
  return {reply:redactAIText(clean(parsed.reply,1200)),handoff:parsed.handoff};
 };
}
