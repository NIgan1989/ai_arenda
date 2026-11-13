import {q,one,uuid,epoch,type Row} from './operation-core';
import {guestModeSql,guestModeJoins,underAutopilot} from './autopilot';
import {wantsEarly,wantedHours,stayOfferAnswer} from './stay-offers';

// Under autopilot the AI administrator answers the guest in the booking chat for the owner.
// It answers only from the booking's own facts: dates, check-in and checkout times, the address
// once the booking is confirmed, house rules, deposit, payment and capacity. Anything else
// (keys, codes, wifi, special requests) goes to the owner, who is told at once.
// Replies are stored as the owner's messages with a request key starting with "ai:".
export const AI_KEY='ai:';
const OWNER_ACTIVE_SECONDS=900;

type Topic='checkin'|'checkout'|'change'|'address'|'access'|'rules'|'deposit'|'payment'|'guests'|'other_question';
const patterns:[Topic,RegExp][]=[
 ['change',/раньше|пораньше|ранн\S* заезд|поздн\S* выезд|позже выех|продли|продлен|задержаться|остаться ещё|остаться еще/i],
 ['checkin',/заезд|заселени|засели|въезд|приехать|приезд|во сколько можно (?:прийти|приехать|зайти)|когда можно (?:прийти|приехать|зайти|заселиться)/i],
 ['checkout',/выезд|выселени|выехать|освободить|до скольки|до какого времени|когда уезжать/i],
 ['address',/адрес|как (?:добраться|доехать|найти|пройти)|где (?:находится|квартира|дом)|какой подъезд|геолокац|локаци/i],
 ['access',/ключ|код|домофон|замок|сейф|ключниц|подъезд открыть|как попасть|как войти|как зайти/i],
 ['rules',/правил|курить|кури|животн|собак|кошк|шум|вечерин|тусовк|гостей пригласить/i],
 ['deposit',/депозит|залог/i],
 ['payment',/оплат|заплатить|платить|kaspi|каспи|перевод|чек|сколько стоит|сумм|цена|стоимост/i],
 ['guests',/сколько (?:человек|гостей|людей)|вместимост|нас будет|можно ли вдвоем|можно ли втроем|можно ли вчетвером/i]
];
const greeting=/^(?:здравствуйте|здравствуй|привет|добрый (?:день|вечер|утро)|доброе утро|салем|сәлем|hello|hi)[\s!.,)]*$/i;
const thanks=/^(?:спасибо|благодарю|рахмет|ок|окей|хорошо|понял|поняла|ясно|👍)[\s!.,)]*$/i;

export function guestTopics(text:string):Topic[]|'greeting'|'thanks'{
 const t=text.trim();
 if(greeting.test(t))return 'greeting';
 if(thanks.test(t))return 'thanks';
 const found=patterns.filter(([,re])=>re.test(t)).map(([topic])=>topic);
 // A key question is never answered by rules or address alone.
 if(found.includes('access'))return ['access'];
 if(!found.length&&/\?|подскажите|скажите|можно|есть ли|а где|а как|когда/i.test(t))return ['other_question'];
 return found;
}

const money=(v:number)=>new Intl.NumberFormat('ru-RU').format(v)+' ₸';
const when=(t:number)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(t*1000));
const paymentText:Record<string,string>={unpaid:'оплата ещё не подтверждена владельцем',pending:'оплата ещё не подтверждена владельцем',owner_verified:'оплата подтверждена'};

function compose(topics:Topic[],b:Row,change?:string):{text:string;escalate:boolean}{
 const lines:string[]=[];let escalate=false;
 // A question about staying longer or coming earlier is answered by the offer, not by the usual times.
 if(change)topics=topics.filter(topic=>topic!=='checkin'&&topic!=='checkout');
 for(const topic of topics){
  if(topic==='checkin')lines.push('Заезд: '+when(b.start)+'.');
  if(topic==='checkout')lines.push('Выезд: до '+when(b.end)+'. Когда будете уходить, нажмите «Сообщить о выезде» в карточке брони.');
  if(topic==='change'&&change)lines.push(change);
  else if(topic==='change')lines.push('Ранний заезд или поздний выезд оформляется кнопкой «Изменить даты или продлить» в карточке брони: я сразу проверю календарь и тариф и покажу итоговую сумму.');
  if(topic==='address')lines.push(b.status==='confirmed'&&b.address?'Адрес: '+b.address+'.':'Точный адрес появится в карточке брони сразу после подтверждения.');
  if(topic==='access'){lines.push('Ключи и доступ в жильё передаёт владелец. Я передал ему ваш вопрос, он ответит здесь.');escalate=true;}
  if(topic==='rules'){if(b.house_rules?.trim())lines.push('Правила жилья: '+b.house_rules.trim());else{lines.push('Особых правил владелец не указал. Уточню у него ваш вопрос.');escalate=true;}}
  if(topic==='deposit')lines.push(b.deposit>0?'Депозит '+money(b.deposit)+(b.deposit_status==='owner_verified'?', получен.':', передаётся владельцу при заезде.')+' Он возвращается после выезда и проверки жилья.':'Депозит по этой брони не требуется.');
  if(topic==='payment')lines.push('Сумма брони '+money(b.amount)+', '+(paymentText[b.payment_status]||'статус оплаты в карточке брони')+'.');
  if(topic==='guests')lines.push('Жильё рассчитано на '+b.capacity+' '+(b.capacity===1?'гостя':'гостей')+'. В брони указано: '+b.guests+'.');
  if(topic==='other_question'){lines.push('На этот вопрос ответит владелец. Я передал ему ваше сообщение.');escalate=true;}
 }
 return {text:lines.join('\n'),escalate};
}

// Called after a guest's message lands in a stay chat. Returns true when the AI replied.
export type StayOfferMaker=(bookingId:string,kind:'late'|'early',wanted:number|null)=>Promise<{offer:Row|null;reason:string}>;
export async function answerGuest(db:D1Database,roomId:string,seq:number,offer?:StayOfferMaker){
 const message=await one(db,"SELECT m.body,m.sender_id,r.entity_kind,r.entity_id,r.channel,r.membership_key FROM discussion_messages m JOIN discussion_rooms r ON r.id=m.room_id WHERE m.room_id=? AND m.seq=? AND m.sender_role='guest'",roomId,seq);
 if(!message||message.entity_kind!=='booking'||message.channel!=='stay')return false;
 const t=epoch();
 const b=await one(db,`SELECT b.*,p.owner_id,p.address,p.capacity,p.title,COALESCE(bt.deposit,0) deposit,bt.deposit_status,COALESCE(NULLIF(bt.house_rules,''),pp.house_rules,'') house_rules,${guestModeSql} mode
  FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN booking_terms bt ON bt.booking_id=b.id ${guestModeJoins} WHERE b.id=? AND b.guest_id=?`,t,message.entity_id,message.sender_id);
 if(!b||b.mode!=='auto'||!['requested','confirmed','completed'].includes(b.status))return false;
 // The owner is writing in this chat right now: the AI stays quiet.
 if(await one(db,"SELECT seq FROM discussion_messages WHERE room_id=? AND sender_role='owner' AND request_key NOT LIKE 'ai:%' AND created_at>?",roomId,t-OWNER_ACTIVE_SECONDS))return false;
 const topics=guestTopics(message.body);
 if(topics==='thanks'||Array.isArray(topics)&&!topics.length)return false;
 // Earlier or longer: the AI checks the calendar and the cleaning and names the price right away.
 let change:string|undefined;
 if(Array.isArray(topics)&&topics.includes('change')&&offer){const kind=wantsEarly(message.body)?'early':'late';try{change=stayOfferAnswer(await offer(b.id,kind,wantedHours(message.body)),kind);}catch(error){console.error('AI administrator: stay offer failed',error instanceof Error?error.message:'');}}
 const reply=topics==='greeting'?{text:'Здравствуйте! Я AI администратор этого жилья. Подскажу время заезда и выезда, адрес, правила, депозит и оплату. Остальное передам владельцу.',escalate:false}:compose(topics,b,change);
 const gate='EXISTS(SELECT 1 FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND p.owner_id=? AND b.guest_id=?) AND EXISTS(SELECT 1 FROM discussion_rooms WHERE id=? AND membership_key=?) AND NOT EXISTS(SELECT 1 FROM discussion_blocks WHERE room_id=?) AND '+underAutopilot('?');
 const statements=[q(db,`INSERT OR IGNORE INTO discussion_messages(room_id,sender_id,sender_role,body,request_key,created_at,photo_data,reply_to) SELECT ?,?,'owner',?,?,?,'',? WHERE ${gate}`,roomId,b.owner_id,reply.text.slice(0,4000),AI_KEY+seq,t,seq,b.id,b.owner_id,b.guest_id,roomId,message.membership_key,roomId,b.property_id,t)];
 if(reply.escalate)statements.push(q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0',uuid(),b.owner_id,'Гость спрашивает в чате брони «'+b.title+'»: «'+String(message.body).slice(0,140)+'». AI администратор не знает ответа, ответьте гостю.','owner:guest-question:'+roomId+':'+seq,t));
 const result=await db.batch(statements);
 return result[0].meta.changes>0;
}
