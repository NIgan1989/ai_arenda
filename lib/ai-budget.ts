import {DomainError,number} from './domain';
import type {RentalService} from './service';
import type {AIBudgetLifecycle,AIBudgetOutcome} from './ai';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';

export type AIBudgetConfig={OPENAI_MODEL?:string;AI_PRICE_MODEL?:string;AI_INPUT_USD_PER_MILLION?:string;AI_OUTPUT_USD_PER_MILLION?:string;AI_GLOBAL_DAILY_REQUEST_LIMIT?:string;AI_GLOBAL_DAILY_TOKEN_LIMIT?:string;AI_GLOBAL_DAILY_USD_CAP?:string};
const defaults={enabled:1,daily_request_limit:200,daily_token_limit:500000,daily_usd_cap_micros:null,version:0};
// Accounting day uses the product's Kazakhstan timezone, independent of the host OS.
const day=()=>new Date(Date.now()+5*3600000).toISOString().slice(0,10);
function positive(value:unknown,max=1000000000){if(value===undefined||value===null||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<=0||n>max)throw new DomainError('Неверная серверная настройка бюджета AI.',503);return n;}
function configLimits(config:AIBudgetConfig){
 const requestLimit=positive(config.AI_GLOBAL_DAILY_REQUEST_LIMIT,100000)||1000,tokenLimit=positive(config.AI_GLOBAL_DAILY_TOKEN_LIMIT,100000000)||3000000,usd=positive(config.AI_GLOBAL_DAILY_USD_CAP,1000000);
 if(!Number.isInteger(requestLimit)||!Number.isInteger(tokenLimit))throw new DomainError('Серверные лимиты запросов и токенов должны быть целыми.',503);
 const inputRate=positive(config.AI_INPUT_USD_PER_MILLION,10000),outputRate=positive(config.AI_OUTPUT_USD_PER_MILLION,10000),priced=config.AI_PRICE_MODEL===config.OPENAI_MODEL&&inputRate!==null&&outputRate!==null;
 return {requestLimit,tokenLimit,costCap:usd===null?null:Math.floor(usd*1000000),inputRate:priced?inputRate:null,outputRate:priced?outputRate:null,priced};
}
export async function reserveAIBudget(db:D1Database,userId:string,config:AIBudgetConfig,requestKey:string,requestByteLength:number){
 if(!/^[\w:.-]{1,120}$/.test(requestKey))throw new DomainError('Некорректный ключ AI-запроса.');
 if(!Number.isInteger(requestByteLength)||requestByteLength<1||requestByteLength>200000)throw new DomainError('AI-запрос слишком велик.',413);
 const previous=await one(db,'SELECT id,status FROM ai_usage_reservations WHERE user_id=? AND request_key=?',userId,requestKey);if(previous)throw new DomainError('Этот AI-запрос уже учтён. Обновите результат, не отправляйте его повторно.',409);
 const prefs=await one(db,'SELECT * FROM ai_budget_preferences WHERE user_id=?',userId)||defaults,limits=configLimits(config);
 if(!prefs.enabled)throw new DomainError('Обращения к модели приостановлены в бюджете аккаунта. Формы и фоновые правила доступны.',409);
 if((prefs.daily_usd_cap_micros!==null||limits.costCap!==null)&&!limits.priced)throw new DomainError('Для денежного лимита нужны серверные тарифы выбранной модели. Запрос не отправлен; формы доступны.',503);
 // Conservative text-input reservation, not a tokenizer or an OpenAI billing statement.
 // Includes JSON, tool schema and instructions plus protocol headroom; max output is fixed in ai.ts.
 const reservedInput=requestByteLength*2+8192,reservedOutput=1400,reservedTokens=reservedInput+reservedOutput,cost=limits.priced?Math.ceil(reservedInput*limits.inputRate!+reservedOutput*limits.outputRate!):null;
 const id=uuid(),today=day();
 // One statement checks both scopes and inserts the hold under the database write lock.
 // Concurrent accounts cannot each spend the same remaining global allowance.
 const inserted=await q(db,`INSERT OR IGNORE INTO ai_usage_reservations(id,user_id,request_key,day,model,reserved_input_tokens,reserved_output_tokens,input_rate,output_rate,reserved_cost_micros,charged_tokens,charged_cost_micros,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?
 WHERE (SELECT COUNT(*) FROM ai_usage_reservations WHERE day=? AND user_id=?)<?
 AND (SELECT COUNT(*) FROM ai_usage_reservations WHERE day=?)<?
 AND (SELECT COALESCE(SUM(charged_tokens),0) FROM ai_usage_reservations WHERE day=? AND user_id=?)+?<=?
 AND (SELECT COALESCE(SUM(charged_tokens),0) FROM ai_usage_reservations WHERE day=?)+?<=?
 AND (? IS NULL OR ((SELECT COUNT(*) FROM ai_usage_reservations WHERE day=? AND user_id=? AND charged_cost_micros IS NULL)=0 AND (SELECT COALESCE(SUM(charged_cost_micros),0) FROM ai_usage_reservations WHERE day=? AND user_id=?)+?<=?))
 AND (? IS NULL OR ((SELECT COUNT(*) FROM ai_usage_reservations WHERE day=? AND charged_cost_micros IS NULL)=0 AND (SELECT COALESCE(SUM(charged_cost_micros),0) FROM ai_usage_reservations WHERE day=?)+?<=?))`,id,userId,requestKey,today,String(config.OPENAI_MODEL||''),reservedInput,reservedOutput,limits.inputRate,limits.outputRate,cost,reservedTokens,cost,epoch(),today,userId,prefs.daily_request_limit,today,limits.requestLimit,today,userId,reservedTokens,prefs.daily_token_limit,today,reservedTokens,limits.tokenLimit,prefs.daily_usd_cap_micros,today,userId,today,userId,cost,prefs.daily_usd_cap_micros,limits.costCap,today,today,cost,limits.costCap).run();
 if(!inserted.meta.changes)throw new DomainError('Дневной бюджет AI исчерпан или стоимость прежних запросов не подтверждена. Запрос не отправлен; формы доступны.',429);
 return {id,day:today,reservedInputTokens:reservedInput,reservedOutputTokens:reservedOutput,reservedCostMicros:cost};
}
export async function completeAIBudget(db:D1Database,userId:string,holdId:string,outcome:AIBudgetOutcome){
 const hold=await one(db,'SELECT * FROM ai_usage_reservations WHERE id=? AND user_id=?',holdId,userId);if(!hold||hold.status!=='reserved')return;
 const usage=outcome.usage,valid=usage&&Number.isInteger(usage.input_tokens)&&usage.input_tokens>=0&&usage.input_tokens<10000000&&Number.isInteger(usage.output_tokens)&&usage.output_tokens>=0&&usage.output_tokens<10000000;
 const rejected=outcome.status==='rejected',known=outcome.status==='completed'&&valid,input=rejected?0:known?usage!.input_tokens:null,output=rejected?0:known?usage!.output_tokens:null;
 const chargedTokens=input===null?hold.charged_tokens:input+output!,cost=rejected?0:known&&hold.input_rate!==null&&hold.output_rate!==null?Math.ceil(input!*hold.input_rate+output!*hold.output_rate):hold.charged_cost_micros;
 await q(db,"UPDATE ai_usage_reservations SET status=?,input_tokens=?,output_tokens=?,charged_tokens=?,charged_cost_micros=?,response_id=?,http_status=?,completed_at=? WHERE id=? AND user_id=? AND status='reserved'",rejected?'rejected':known?'completed':'uncertain',input,output,chargedTokens,cost,String(outcome.responseId||'').slice(0,200),outcome.httpStatus||null,epoch(),holdId,userId).run();
}
export function createAIBudgetLifecycle(db:D1Database,userId:string,config:AIBudgetConfig,requestKey=uuid()):AIBudgetLifecycle{
 let hold:{id:string}|undefined;
 return {async beforeRequest(bodyJson){hold=await reserveAIBudget(db,userId,config,requestKey,new TextEncoder().encode(bodyJson).byteLength);},async finish(outcome){if(hold)await completeAIBudget(db,userId,hold.id,outcome);}};
}
export async function aiBudgetState(service:RentalService,config:AIBudgetConfig={},platformAdmin=false){
 const prefs=await one(service.db,'SELECT * FROM ai_budget_preferences WHERE user_id=?',service.userId)||defaults,limits=configLimits(config),today=day();
 const totals=await one(service.db,"SELECT COUNT(*) requests,COALESCE(SUM(charged_tokens),0) charged_tokens,SUM(CASE WHEN charged_cost_micros IS NULL THEN 1 ELSE 0 END) unknown_cost_requests,COALESCE(SUM(charged_cost_micros),0) cost_micros,SUM(CASE WHEN status IN ('reserved','uncertain') THEN 1 ELSE 0 END) uncertain_requests FROM ai_usage_reservations WHERE day=? AND user_id=?",today,service.userId);
 const recent=await rows(service.db,'SELECT id,model,status,input_tokens,output_tokens,reserved_input_tokens,reserved_output_tokens,charged_tokens,charged_cost_micros,created_at FROM ai_usage_reservations WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30',service.userId);
 const global=platformAdmin?await one(service.db,'SELECT COUNT(*) requests,COALESCE(SUM(charged_tokens),0) charged_tokens,SUM(CASE WHEN charged_cost_micros IS NULL THEN 1 ELSE 0 END) unknown_cost_requests,COALESCE(SUM(charged_cost_micros),0) cost_micros FROM ai_usage_reservations WHERE day=?',today):null;
 return {preferences:prefs,day:today,timeZone:'Asia/Almaty',totals,recent,pricingConfigured:limits.priced,priceModel:limits.priced?config.AI_PRICE_MODEL:null,global,globalLimits:platformAdmin?{requests:limits.requestLimit,tokens:limits.tokenLimit,costMicros:limits.costCap}:null,note:'Учёт использования помощника по тарифам сервера. При неизвестном результате сохраняется резерв. Неизвестная стоимость не считается нулевой.'};
}
export async function saveAIBudget(service:RentalService,body:Row){
 if(!await service.profile())throw new DomainError('Сначала заполните профиль.',403);
 const version=number(body.expectedVersion,'Версия',0,10000000),requests=number(body.dailyRequestLimit,'Запросов в день',1,1000),tokens=number(body.dailyTokenLimit,'Токенов в день',1000,5000000),cap=body.dailyUsdCap===null||body.dailyUsdCap===''||body.dailyUsdCap===undefined?null:positive(body.dailyUsdCap,1000);
 if(typeof body.enabled!=='boolean'||cap!==null&&cap<0.01)throw new DomainError('Укажите денежный лимит от 0,01 USD или оставьте поле пустым.');
 const at=epoch(),result=await q(service.db,'INSERT INTO ai_budget_preferences SELECT ?,?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM ai_budget_preferences WHERE user_id=? AND version=?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,daily_request_limit=excluded.daily_request_limit,daily_token_limit=excluded.daily_token_limit,daily_usd_cap_micros=excluded.daily_usd_cap_micros,version=excluded.version,updated_at=excluded.updated_at WHERE ai_budget_preferences.version=?',service.userId,body.enabled?1:0,requests,tokens,cap===null?null:Math.floor(cap*1000000),version+1,at,version,service.userId,version,version).run();
 if(!result.meta.changes)throw new DomainError('Бюджет уже изменился. Обновите состояние.',409);
 await service.audit(service.userId,'ai.budget_updated').run();return {message:'Бюджет AI сохранён для аккаунта и всех его ролей.',version:version+1};
}
