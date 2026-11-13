import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import type {Approval} from './approvals';
import {defaultAssistantSettings} from './assistant';
import {quietNow} from './administrator';
import {pushConfigured} from './web-push';
import {epoch,uuid,q,one,rows,hash,randomToken,httpsEndpoint,safeEqual,type Row,type OperationConfig} from './operation-core';

export function integrationStatus(config:OperationConfig){return {push:pushConfigured(config),telegram:!!(config.TELEGRAM_BOT_TOKEN&&config.TELEGRAM_BOT_USERNAME&&config.TELEGRAM_WEBHOOK_SECRET),sms:!!(config.SMS_GATEWAY_URL&&config.SMS_GATEWAY_TOKEN),whatsapp:!!(config.WHATSAPP_GATEWAY_URL&&config.WHATSAPP_GATEWAY_TOKEN),payments:!!(config.PAYMENT_GATEWAY_URL&&config.PAYMENT_GATEWAY_TOKEN&&config.PAYMENT_WEBHOOK_SECRET),secureAccess:!!config.ACCESS_ENCRYPTION_KEY};}
export async function deliveryState(service:RentalService,role:Role,config:OperationConfig){return {configured:integrationStatus(config),channels:(await rows(service.db,'SELECT channel,address,enabled,verified_at FROM delivery_channels WHERE user_id=? AND role=?',service.userId,role)).map(c=>({...c,address:c.channel==='telegram'?'Привязанный личный чат':c.address.replace(/.(?=.{4})/g,'•')})),recent:await rows(service.db,'SELECT channel,status,attempts,last_error,created_at,sent_at,delivered_at,read_at FROM delivery_outbox WHERE user_id=? AND role=? ORDER BY created_at DESC LIMIT 20',service.userId,role)};}
export async function createTelegramLink(service:RentalService,role:Role,config:OperationConfig){
 if(!integrationStatus(config).telegram)throw new DomainError('Рабочий Telegram-бот ещё не подключён. После подключения здесь появится привязка.',503);
 const username=config.TELEGRAM_BOT_USERNAME!;if(!/^[A-Za-z0-9_]{5,32}$/.test(username))throw new DomainError('Серверная настройка имени бота некорректна.',503);
 const token=randomToken();await q(service.db,'DELETE FROM delivery_links WHERE user_id=? AND role=?',service.userId,role).run();await q(service.db,'INSERT INTO delivery_links VALUES (?,?,?,?,NULL)',await hash(token),service.userId,role,epoch()+600).run();return {url:'https://t.me/'+username+'?start='+token,expiresAt:epoch()+600,message:'Откройте личный чат с ботом и нажмите Start. Привязка действует 10 минут.'};
}
const BOT_HELP='Здравствуйте! Это бот уведомлений «Ай Аренда». Чтобы получать сюда заявки и события, откройте приложение или сайт → Аккаунт → Telegram и нажмите «Подключить».';
const ROLE_NAMES:Record<string,string>={guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'};
// The bot answers in the chat so the person sees that linking worked. A failed reply never undoes the link.
async function botReply(config:OperationConfig,chatId:unknown,text:string){
 if(!config.TELEGRAM_BOT_TOKEN)return;
 try{const r=await fetch('https://api.telegram.org/bot'+config.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,link_preview_options:{is_disabled:true}}),redirect:'manual',signal:AbortSignal.timeout(8000)});if(!r.ok)console.error('Telegram reply failed: '+r.status);}catch(e){console.error('Telegram reply failed: '+String((e as Error)?.message||e).split(config.TELEGRAM_BOT_TOKEN).join('***'));}
}
// The account screen: is the bot set up, and is this role's chat linked and switched on.
export type ServiceFor=(userId:string)=>RentalService;
const ROLE_CODES:Record<string,Role>={g:'guest',o:'owner',c:'cleaner'};
const tg=async(config:OperationConfig,method:string,body:Row)=>{try{const r=await fetch('https://api.telegram.org/bot'+config.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(8000)});if(!r.ok)console.error('Telegram '+method+' failed: '+r.status);}catch(e){console.error('Telegram '+method+' failed: '+String((e as Error)?.message||e).split(String(config.TELEGRAM_BOT_TOKEN)).join('***'));}};
const revisionTag=async(revision:string)=>(await hash(revision)).slice(0,10);
// The card a notice is about: the same one-tap decision as on the map, answered from Telegram.
export async function noticeDecision(service:RentalService,role:Role,dedupe:string):Promise<Approval|null>{
 // Each notice kind names its own card; nothing is guessed from shared booking or job ids.
 const [kind,first,second]=(dedupe.startsWith(role+':')?dedupe.slice(role.length+1):dedupe).split(':');let cardId='';
 if(['booking','change','price','window','forecast','listing','stay'].includes(kind)&&first)cardId=kind+':'+first;
 else if(kind==='checkout-reported'&&first)cardId='checkout:'+first;
 else if(kind==='submitted'&&first)cardId='report:'+first;
 else if(kind==='application'&&first&&second){const a=await one(service.db,"SELECT id FROM applications WHERE job_id=? AND user_id=? AND status='pending'",first,second);if(a)cardId='application:'+a.id;}
 if(!cardId)return null;
 return ((await service.roleState(role,{catalog:false})).approvals as Approval[]).find(c=>c.id===cardId&&c.canDecide)||null;
}
// Only the AI administrator's own explanations leave the service; reports and reasons people wrote stay behind «Открыть».
const OWN_DETAIL=new Set(['price','window','forecast','listing','stay']);
export async function decisionMessage(card:Approval,role:Role,base:string|null){
 const code=Object.keys(ROLE_CODES).find(k=>ROLE_CODES[k]===role)!,tag=await revisionTag(card.revision),data=(a:string)=>a+code+card.id+'|'+tag;
 const text=[card.title+(card.subject?' · '+card.subject:''),...card.facts.filter(([,v])=>v).map(([k,v])=>k+': '+v),OWN_DETAIL.has(card.kind)?card.detail||'':''].filter(Boolean).join('\n').slice(0,3500);
 const open=base?[{text:'Открыть',url:base+'/workspace/'+role+'/map'}]:[];
 if(data('y').length>64)return {text,reply_markup:open.length?{inline_keyboard:[open]}:undefined};
 const answer=[{text:card.acceptLabel.slice(0,60),callback_data:data('y')},...(card.requiresReason?[]:[{text:card.rejectLabel.slice(0,60),callback_data:data('n')}])];
 return {text,reply_markup:{inline_keyboard:[answer,...(open.length?[open]:[])]}};
}
async function telegramDecide(db:D1Database,query:Row,config:OperationConfig,serviceFor:ServiceFor){
 const chat=query.message?.chat,match=typeof query.data==='string'?query.data.match(/^([yn])([goc])(.+)\|([0-9a-f]{10})$/):null;
 const reply=async(text:string,done:boolean)=>{await tg(config,'answerCallbackQuery',{callback_query_id:query.id,text:text.slice(0,190)});if(done&&chat)await tg(config,'editMessageText',{chat_id:chat.id,message_id:query.message.message_id,text:(String(query.message.text||'')+'\n\n'+text).slice(0,4000)});};
 if(!match||chat?.type!=='private'||query.from?.is_bot||String(chat.id)!==String(query.from?.id)){await tg(config,'answerCallbackQuery',{callback_query_id:query.id});return {ignored:true};}
 const role=ROLE_CODES[match[2]],channel=await one(db,"SELECT user_id FROM delivery_channels WHERE channel='telegram' AND role=? AND address=? AND verified_at IS NOT NULL",role,String(chat.id));
 if(!channel){await reply('Этот чат не привязан. Подключите Telegram в «Ай Аренда» → Аккаунт.',false);return {ignored:true};}
 const service=serviceFor(channel.user_id);
 try{
  const card=((await service.roleState(role,{catalog:false})).approvals as Approval[]).find(c=>c.id===match[3]);
  if(!card){await reply('Уже решено или срок истёк.',true);return {ignored:true};}
  if(await revisionTag(card.revision)!==match[4]){await reply('Условия изменились. Откройте сервис и проверьте карточку.',true);return {ignored:true};}
  const result=await service.decideApproval(role,{id:card.id,revision:card.revision,action:match[1]==='y'?'accept':'reject'}) as Row;
  await reply('✅ '+String(result?.message||'Готово.'),true);return {decided:true};
 }catch(e){await reply(e instanceof DomainError?e.message:'Не получилось. Откройте сервис и повторите.',e instanceof DomainError);if(!(e instanceof DomainError))console.error('Telegram decision failed');return {failed:true};}
}
export async function telegramStatus(service:RentalService,role:Role,config:OperationConfig){
 const c=await one(service.db,"SELECT enabled,verified_at FROM delivery_channels WHERE user_id=? AND role=? AND channel='telegram'",service.userId,role);
 return {configured:integrationStatus(config).telegram,linked:!!c?.verified_at,enabled:!!(c?.verified_at&&c.enabled),linkedAt:Number(c?.verified_at||0)};
}
export async function acceptTelegramLink(db:D1Database,body:Row,providedSecret:string|null,config:OperationConfig,serviceFor?:ServiceFor){
 if(!config.TELEGRAM_WEBHOOK_SECRET||!safeEqual(providedSecret||'',config.TELEGRAM_WEBHOOK_SECRET))throw new DomainError('Нет доступа к событию бота.',403);
 if(body.callback_query)return serviceFor?telegramDecide(db,body.callback_query,config,serviceFor):{ignored:true};
 const message=body.message,match=typeof message?.text==='string'?message.text.match(/^\/start(?:@[A-Za-z0-9_]+)? ([a-f0-9]{48})$/):null;
 const privateChat=message?.chat?.type==='private'&&!message.from?.is_bot&&String(message.chat?.id)===String(message.from?.id);
 if(!match||!privateChat){if(privateChat)await botReply(config,message.chat.id,BOT_HELP);return {ignored:true};}
 const link=await one(db,'SELECT * FROM delivery_links WHERE hash=? AND used_at IS NULL AND expires_at>?',await hash(match[1]),epoch());if(!link){await botReply(config,message.chat.id,'Ссылка устарела. Откройте «Ай Аренда» → Аккаунт → Telegram и нажмите «Подключить» ещё раз.');return {ignored:true};}
 const auditId=uuid(),at=epoch();await db.batch([
  q(db,'UPDATE delivery_links SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>?',at,link.hash,at),
  q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',auditId,link.user_id,link.user_id,'delivery.telegram_linked:'+link.role,at),
  q(db,"INSERT INTO delivery_channels SELECT ?,?,'telegram',?,1,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?) ON CONFLICT(user_id,role,channel) DO UPDATE SET address=excluded.address,enabled=1,verified_at=excluded.verified_at,updated_at=excluded.updated_at",link.user_id,link.role,String(message.chat.id),at,at,auditId),
  // One person, one Telegram: the same Start links the person's other roles too. A role the person
  // switched off stays off; only its chat moves to the new one.
  q(db,"INSERT INTO delivery_channels SELECT ?,r.value,'telegram',?,1,?,? FROM json_each(COALESCE((SELECT roles FROM profiles WHERE id=?),'[]')) r WHERE r.value IN ('guest','owner','cleaner') AND r.value<>? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?) ON CONFLICT(user_id,role,channel) DO UPDATE SET address=excluded.address,verified_at=excluded.verified_at,updated_at=excluded.updated_at",link.user_id,String(message.chat.id),at,at,link.user_id,link.role,auditId)
 ]);
 const linked=await rows(db,"SELECT role FROM delivery_channels WHERE user_id=? AND channel='telegram' AND verified_at=? AND address=?",link.user_id,at,String(message.chat.id));
 const names=['guest','owner','cleaner'].filter(r=>linked.some(l=>l.role===r)).map(r=>'«'+ROLE_NAMES[r]+'»');
 await botReply(config,message.chat.id,'Готово! Уведомления «Ай Аренда» будут приходить сюда: заявки, брони, уборки. '+(names.length>1?'Роли: ':'Роль: ')+(names.join(', ')||'«'+(ROLE_NAMES[link.role]||link.role)+'»')+'. Выключить можно на сайте или в приложении: Аккаунт → Telegram.');
 return {linked:true};
}
export async function setDeliveryChannel(service:RentalService,role:Role,body:Row,config:OperationConfig){
 const channel=required(body.channel,'Канал',20);if(!['telegram','sms','whatsapp'].includes(channel))throw new DomainError('Неизвестный канал.');
 if(body.enabled!==true){await q(service.db,'UPDATE delivery_channels SET enabled=0,updated_at=? WHERE user_id=? AND role=? AND channel=?',epoch(),service.userId,role,channel).run();await q(service.db,"UPDATE delivery_outbox SET status='cancelled' WHERE user_id=? AND role=? AND channel=? AND status IN ('pending','dead')",service.userId,role,channel).run();return {message:'Доставка в канал отключена.'};}
 if(!integrationStatus(config)[channel as 'telegram'|'sms'|'whatsapp'])throw new DomainError('Этот внешний канал ещё не настроен на сервере.',503);
 if(channel==='telegram'){const result=await q(service.db,"UPDATE delivery_channels SET enabled=1,updated_at=? WHERE user_id=? AND role=? AND channel='telegram' AND verified_at IS NOT NULL",epoch(),service.userId,role).run();if(!result.meta.changes)throw new DomainError('Сначала привяжите личный чат с ботом.',409);}
 else{const phone=await one(service.db,'SELECT phone FROM phone_verifications WHERE user_id=? AND verified_at IS NOT NULL',service.userId);if(!phone)throw new DomainError('Сначала подтвердите номер телефона.',409);await q(service.db,'INSERT INTO delivery_channels VALUES (?,?,?,?,1,?,?) ON CONFLICT(user_id,role,channel) DO UPDATE SET address=excluded.address,enabled=1,verified_at=excluded.verified_at,updated_at=excluded.updated_at',service.userId,role,channel,phone.phone,epoch(),epoch()).run();}
 return {message:'Доставка включена для вашей текущей роли.'};
}

export async function deliverOutbox(db:D1Database,config:OperationConfig,limit=30,serviceFor?:ServiceFor){
 const pending=await rows(db,"SELECT o.*,n.dedupe,n.body,c.address,c.enabled,c.verified_at,p.settings FROM delivery_outbox o JOIN notifications n ON n.id=o.notification_id LEFT JOIN delivery_channels c ON c.user_id=o.user_id AND c.role=o.role AND c.channel=o.channel LEFT JOIN assistant_preferences p ON p.user_id=o.user_id AND p.role=o.role WHERE (o.status='pending' AND o.available_at<=?) OR (o.status='sending' AND o.lease_until<=?) ORDER BY o.created_at LIMIT ?",epoch(),epoch(),limit);
 let sent=0,failed=0;const deadline=Date.now()+20000;
 for(const item of pending){
  if(Date.now()>deadline)break;
  if(!item.enabled||!item.verified_at){await q(db,"UPDATE delivery_outbox SET status='cancelled' WHERE id=?",item.id).run();continue;}
  const settings={...defaultAssistantSettings,...(item.settings?JSON.parse(item.settings):{})},urgent=/Требует внимания\.|no-show|overdue/.test(item.body+' '+item.dedupe);
  if(quietNow(settings,epoch())&&!(settings.urgentInQuiet&&urgent)){await q(db,'UPDATE delivery_outbox SET available_at=? WHERE id=?',epoch()+300,item.id).run();continue;}
  const token=uuid(),claim=await q(db,"UPDATE delivery_outbox SET status='sending',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='sending' AND lease_until<=?)) RETURNING attempts",token,epoch()+90,item.id,epoch(),epoch()).first<Row>();if(!claim)continue;
  try{
   const base=config.SITE_PUBLIC_URL?httpsEndpoint(config.SITE_PUBLIC_URL).origin:null;
   // External notices contain no addresses, access codes or issue descriptions.
   const text='AI Аренда: новое событие в рабочей роли. '+(base?base+'/workspace/'+item.role+'/assistant':'Откройте сервис и проверьте задачи.');
   let response:Response;
   if(item.channel==='telegram'){
    if(!config.TELEGRAM_BOT_TOKEN)throw new Error('channel_not_configured');
    response=await fetch('https://api.telegram.org/bot'+config.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:item.address,...await telegramNotice(item,text,base,serviceFor),link_preview_options:{is_disabled:true}}),redirect:'manual',signal:AbortSignal.timeout(15000)});
   }else{
    const url=item.channel==='sms'?config.SMS_GATEWAY_URL:config.WHATSAPP_GATEWAY_URL,secret=item.channel==='sms'?config.SMS_GATEWAY_TOKEN:config.WHATSAPP_GATEWAY_TOKEN;if(!secret)throw new Error('channel_not_configured');
    response=await fetch(httpsEndpoint(url),{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Idempotency-Key':item.id},body:JSON.stringify({id:item.id,to:item.address,text,category:'notification'}),redirect:'manual',signal:AbortSignal.timeout(15000)});
   }
   if(!response.ok)throw new Error(response.status===429?'rate_limit':'delivery_failed');
   const value=await response.json() as Row;if(item.channel==='telegram'&&value.ok!==true)throw new Error('delivery_failed');const reference=String(item.channel==='telegram'?value.result?.message_id:value.id||'accepted');
   await q(db,"UPDATE delivery_outbox SET status='sent',sent_at=?,provider_reference=?,last_error='',lease_until=0 WHERE id=? AND lease_token=?",epoch(),reference.slice(0,200),item.id,token).run();sent++;
  }catch(error){const code=['channel_not_configured','rate_limit'].includes((error as Error).message)?(error as Error).message:'delivery_failed';await q(db,"UPDATE delivery_outbox SET status=?,last_error=?,available_at=?,lease_until=0 WHERE id=? AND lease_token=?",claim.attempts>=8?'dead':'pending',code,epoch()+Math.min(3600,30*2**Math.min(claim.attempts,7)),item.id,token).run();failed++;}
 }
 return {sent,failed};
}
export async function acceptDeliveryReceipt(db:D1Database,raw:string){
 let body:Row;try{body=JSON.parse(raw);}catch{throw new DomainError('Неверный формат подтверждения.');}
 if(!['sms','whatsapp'].includes(body.channel)||!['delivered','read','failed'].includes(body.status))throw new DomainError('Неизвестный вид подтверждения доставки.');
 const eventId=required(body.eventId,'Событие',120),outboxId=required(body.outboxId,'Сообщение',100),digest=await hash(raw),previous=await one(db,'SELECT payload_hash FROM delivery_events WHERE channel=? AND event_id=?',body.channel,eventId);
 if(previous){if(previous.payload_hash!==digest)throw new DomainError('Событие доставки изменилось при повторе.',409);return {duplicate:true};}
 const message=await one(db,"SELECT * FROM delivery_outbox WHERE id=? AND channel=? AND status IN ('sending','sent')",outboxId,body.channel);if(!message)throw new DomainError('Отправленное сообщение не найдено.',409);
 await db.batch([
  q(db,'INSERT INTO delivery_events VALUES (?,?,?,?,?,?)',body.channel,eventId,outboxId,body.status,digest,epoch()),
  q(db,"UPDATE delivery_outbox SET delivered_at=CASE WHEN ? IN ('delivered','read') THEN COALESCE(delivered_at,?) ELSE delivered_at END,read_at=CASE WHEN ?='read' THEN COALESCE(read_at,?) ELSE read_at END,last_error=CASE WHEN ?='failed' THEN 'provider_delivery_failed' ELSE last_error END WHERE id=? AND channel=?",body.status,epoch(),body.status,epoch(),body.status,outboxId,body.channel)
 ]);return {recorded:true};
}

// A notice that asks for a decision carries the card and its buttons; anything else stays a short pointer.
async function telegramNotice(item:Row,text:string,base:string|null,serviceFor?:ServiceFor):Promise<Row>{
 if(!serviceFor)return {text};
 try{const card=await noticeDecision(serviceFor(item.user_id),item.role,item.dedupe);if(card)return decisionMessage(card,item.role,base);}catch{/* the plain notice still goes out */}
 return {text};
}
