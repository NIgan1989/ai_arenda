import {DomainError} from './domain';
import type {RentalService} from './service';
import {redactAIText,reserveAIRequest,type AIConfig,type AIBudgetOutcome} from './ai';
import {createAIBudgetLifecycle} from './ai-budget';
import {aiDataPermission} from './ai-data-permission';
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
 };
}

/** The guest's own permission, limits and budget apply: it is the guest's text that leaves the service. */
export function guestModel(s:RentalService,config:AIConfig):GuestModel|undefined{
 if(!config.OPENAI_API_KEY||!config.OPENAI_MODEL)return undefined;
 return async(facts,history,text)=>{
  if(!(await aiDataPermission(s)).allowed)return null;
  try{await reserveAIRequest(s.db,s.userId);}catch(error){if(error instanceof DomainError)return null;throw error;}
  const budget=createAIBudgetLifecycle(s.db,s.userId,config);
  let sent=false,accounted=false;
  const settle=async(outcome:AIBudgetOutcome)=>{if(!accounted){accounted=true;await budget.finish(outcome);}};
  try{
   const input=[...history.slice(-6).map(m=>({role:m.from==='guest'?'user' as const:'assistant' as const,content:redactAIText(clean(m.text,600))})),{role:'user' as const,content:redactAIText(clean(text,1500))}];
   const bodyJson=JSON.stringify({model:config.OPENAI_MODEL,store:false,max_output_tokens:400,
    ...(/^gpt-6-(?:luna|sol)$/.test(config.OPENAI_MODEL!)?{reasoning:{effort:'none'}}:{}),
    instructions:instructions+'\n\nФакты брони:\n'+JSON.stringify(facts),input,
    text:{format:{type:'json_schema',name:'guest_answer',strict:true,schema}}});
   await budget.beforeRequest(bodyJson);sent=true;
   const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${config.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:bodyJson});
   if(!response.ok){await settle({status:[400,401,403,404,422,429].includes(response.status)?'rejected':'uncertain',httpStatus:response.status});return null;}
   const result=await response.json() as {id?:string;usage?:{input_tokens:number;output_tokens:number};output?:{type:string;content?:{type:string;text?:string}[]}[]};
   await settle({status:'completed',usage:result.usage,responseId:result.id,httpStatus:response.status});
   const raw=result.output?.filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('').trim();
   let parsed:Row;try{parsed=JSON.parse(raw||'');}catch{return null;}
   if(typeof parsed?.handoff!=='boolean'||typeof parsed?.reply!=='string')return null;
   return {reply:redactAIText(clean(parsed.reply,1200)),handoff:parsed.handoff};
  }catch{
   if(sent&&!accounted)try{await settle({status:'uncertain'});}catch{/* The hold stays reserved. */}
   return null;
  }
 };
}
