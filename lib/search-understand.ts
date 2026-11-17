import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {redactAIText,reserveAIRequest,type AIConfig,type AIBudgetOutcome} from './ai';
import {createAIBudgetLifecycle} from './ai-budget';
import {aiDataPermission} from './ai-data-permission';
import type {Row} from './operation-core';
import {mapCities} from './map-location';

// «ИИ в строке»: a phrase the request rules could not read is put by the model into the words the rules do read
// ("с собакой на недельку с пятницы" → "с пятницы на 7 суток"). The model never searches, prices or books: its phrase
// goes through the same rules as a phrase typed by the guest, so a date or a price it could invent is checked there.
// What the search cannot take into account (a pet, a landmark) comes back in `dropped` and is said to the guest.
export const UNDERSTAND_MAX=300;
const schema={type:'object',properties:{phrase:{type:'string',description:'Фраза из понятных сервису слов или пустая строка, если это не поиск жилья.'},dropped:{type:'array',items:{type:'string'},description:'Пожелания гостя его словами, которые не удалось выразить понятными словами. До 5.'}},required:['phrase','dropped'],additionalProperties:false};
const instructions=(cities:string[],now:string)=>`Ты разбираешь запрос гостя сервиса аренды жилья на часы и сутки в Казахстане. Гостю не отвечай. Перепиши запрос короткой фразой только из слов, которые понимает поиск сервиса, ничего не выдумывая: чего гость не называл, того во фразе нет.
Понятные слова:
- день: сегодня, завтра, послезавтра, в пятницу, 20 ноября, с 20 по 22 ноября, на выходные;
- срок: на 3 часа (до 23), на сутки, на 3 суток (до 30), на ночь, на 2 ночи; «на неделю» пиши «на 7 суток», «на месяц» — «на 30 суток»;
- время начала: в 18:00; «сейчас», если жильё нужно немедленно;
- гости: на двоих, на 4 человек (дети считаются гостями);
- бюджет: до 15000 за сутки, до 3000 за час, до 9000 за ночь;
- город: ${cities.join(', ')||'любой из списка сервиса'}; район: «в центре» или название района;
- тип жилья: квартира, студия, комната, дом, гостевой дом, хостел, гостиница, апартаменты; комнаты: 1-комнатная, 2-комнатная, от 2 комнат;
- удобства: wi-fi, парковка, кухня, рабочее место, кондиционер, стиральная машина, телевизор, балкон, лифт, фен, утюг, детская кроватка; «с питомцами» — если гость едет с животным; «рядом» — рядом с гостем; «рядом с вокзалом», «возле ТРЦ Батыр Молл» — рядом с названным местом; «дешевле», «ближе».
Сейчас ${now}, часовой пояс Asia/Almaty. Относительные дни («через неделю», «в следующую субботу») переведи в дату вида «25 ноября».
Всё, что этими словами не выразить (баня, бассейн, отзывы, депозит, вид из окна), не добавляй во фразу, а перечисли в dropped словами гостя. Если сообщение не о поиске жилья, верни пустую phrase.`;
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';

/**
 * status: 'ok' (phrase to run through the rules), 'none' (not a search, or nothing could be kept), 'off' (no model on
 * this server), 'permission' (the guest has not allowed sending text to the model), 'busy' (limit, budget or failure).
 */
export async function understandSearch(s:RentalService,body:Row,config:AIConfig={},cities:string[]=Object.keys(mapCities)){
 await s.requireRole('guest');
 const text=required(body.text,'Запрос',UNDERSTAND_MAX);
 if(!config.OPENAI_API_KEY||!config.OPENAI_MODEL)return {status:'off' as const};
 if(!(await aiDataPermission(s)).allowed)return {status:'permission' as const};
 const busy={status:'busy' as const};
 try{await reserveAIRequest(s.db,s.userId);}catch(error){if(error instanceof DomainError)return busy;throw error;}
 const budget=createAIBudgetLifecycle(s.db,s.userId,config);
 let sent=false,accounted=false;
 const settle=async(outcome:AIBudgetOutcome)=>{if(!accounted){accounted=true;await budget.finish(outcome);}};
 try{
  const now=new Date(Date.now()+5*3600000).toISOString().slice(0,16).replace('T',' ');
  const bodyJson=JSON.stringify({model:config.OPENAI_MODEL,store:false,max_output_tokens:300,
   ...(/^gpt-6-(?:luna|sol)$/.test(config.OPENAI_MODEL)?{reasoning:{effort:'none'}}:{}),
   instructions:instructions(cities.slice(0,40),now),
   input:[{role:'user',content:redactAIText(text)}],
   text:{format:{type:'json_schema',name:'search_phrase',strict:true,schema}}});
  await budget.beforeRequest(bodyJson);sent=true;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${config.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:bodyJson});
  if(!response.ok){await settle({status:[400,401,403,404,422,429].includes(response.status)?'rejected':'uncertain',httpStatus:response.status});return busy;}
  const result=await response.json() as {id?:string;usage?:{input_tokens:number;output_tokens:number};output?:{type:string;content?:{type:string;text?:string}[]}[]};
  await settle({status:'completed',usage:result.usage,responseId:result.id,httpStatus:response.status});
  const raw=result.output?.filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('').trim();
  let parsed:Row;try{parsed=JSON.parse(raw||'');}catch{return busy;}
  const phrase=clean(parsed?.phrase,200),dropped=(Array.isArray(parsed?.dropped)?parsed.dropped:[]).map((v:unknown)=>clean(v,60)).filter(Boolean).slice(0,5);
  return phrase?{status:'ok' as const,phrase,dropped}:{status:'none' as const,dropped};
 }catch(error){
  if(sent&&!accounted)try{await settle({status:'uncertain'});}catch{/* The hold stays reserved. */}
  return busy;
 }
}
