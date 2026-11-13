import {DomainError,number,required} from './domain';
export type Row=Record<string,any>;
import type {AIBudgetConfig} from './ai-budget';
export type PushConfig={VAPID_PUBLIC_KEY?:string;VAPID_PRIVATE_KEY?:string;VAPID_SUBJECT?:string};
export type MatchingRunnerConfig={ADMINISTRATOR_RUNNER_SECRET?:string};
export type OperationConfig=AIBudgetConfig&PushConfig&MatchingRunnerConfig&{TEST_DATA_ONLY?:string;ROUTING_FOOT_URL?:string;ROUTING_CAR_URL?:string;STADIA_API_KEY?:string;SITE_PUBLIC_URL?:string;TELEGRAM_BOT_TOKEN?:string;TELEGRAM_BOT_USERNAME?:string;TELEGRAM_WEBHOOK_SECRET?:string;SMS_GATEWAY_URL?:string;SMS_GATEWAY_TOKEN?:string;WHATSAPP_GATEWAY_URL?:string;WHATSAPP_GATEWAY_TOKEN?:string;DELIVERY_WEBHOOK_SECRET?:string;PAYMENT_GATEWAY_URL?:string;PAYMENT_GATEWAY_TOKEN?:string;PAYMENT_WEBHOOK_SECRET?:string;ACCESS_ENCRYPTION_KEY?:string;CALENDAR_ALLOWED_HOSTS?:string;BUCKET?:R2Bucket};
export const epoch=()=>Math.floor(Date.now()/1000);
export const uuid=()=>crypto.randomUUID();
export const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
export const q=(db:D1Database,sql:string,...args:any[])=>db.prepare(sql).bind(...args);
export const rows=async(db:D1Database,sql:string,...args:any[])=>(await q(db,sql,...args).all<Row>()).results;
export const one=async(db:D1Database,sql:string,...args:any[])=>q(db,sql,...args).first<Row>();
export function httpsEndpoint(value:string|undefined){let url:URL;try{url=new URL(value||'');}catch{throw new DomainError('Внешнее подключение ещё не настроено.',503);}if(url.protocol!=='https:'||url.username||url.password||/^(localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname))throw new DomainError('Нужен защищённый адрес внешнего сервиса.',400);return url;}
export function configuredOrigin(value?:string){return httpsEndpoint(value).origin;}
export function boundedKey(body:Row){return required(body.requestKey,'Ключ операции',120);}
export function amountInput(body:Row){if(body.confirmed!==true)throw new DomainError('Подтвердите фактическую операцию.');return number(body.amount,'Сумма, ₸',1,100000000);}
export async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
export async function validSignature(secret:string|undefined,raw:string,timestamp:string|null,signature:string|null){if(!secret||secret.length<32||!timestamp||!signature||!/^\d{10}$/.test(timestamp)||Math.abs(epoch()-Number(timestamp))>300)return false;return safeEqual(await hmac(secret,timestamp+'.'+raw),signature);}
export function safeEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export async function audit(db:D1Database,actor:string,entity:string,action:Row){await q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),actor,entity,JSON.stringify(action),epoch()).run();}
