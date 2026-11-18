import {DomainError} from './domain';
import type {RentalService} from './service';
import {reserveAIRequest,type AIConfig,type AIBudgetOutcome} from './ai';
import {createAIBudgetLifecycle} from './ai-budget';
import {aiDataPermission} from './ai-data-permission';
import type {Row} from './operation-core';

// One question to the model with a strict JSON answer, on behalf of one person: their permission to send data,
// their hourly limit and the AI budget apply. Any refusal, limit or failure gives null, and the caller then
// goes the fixed way (the rules). The model only answers: what it says is checked by the caller.
export type ModelAsk={name:string;instructions:string;input:{role:'user'|'assistant';content:string}[];schema:Row;maxTokens?:number;timeoutMs?:number};
export const modelReady=(config:AIConfig)=>!!(config.OPENAI_API_KEY&&config.OPENAI_MODEL);
export async function askModelJSON(db:D1Database,userId:string,config:AIConfig,ask:ModelAsk):Promise<Row|null>{
 if(!modelReady(config))return null;
 if(!(await aiDataPermission({db,userId} as unknown as RentalService)).allowed)return null;
 try{await reserveAIRequest(db,userId);}catch(error){if(error instanceof DomainError)return null;throw error;}
 const budget=createAIBudgetLifecycle(db,userId,config);
 let sent=false,accounted=false;
 const settle=async(outcome:AIBudgetOutcome)=>{if(!accounted){accounted=true;await budget.finish(outcome);}};
 try{
  const bodyJson=JSON.stringify({model:config.OPENAI_MODEL,store:false,max_output_tokens:ask.maxTokens||400,
   ...(/^gpt-6-(?:luna|sol)$/.test(config.OPENAI_MODEL!)?{reasoning:{effort:'none'}}:{}),
   instructions:ask.instructions,input:ask.input,
   text:{format:{type:'json_schema',name:ask.name,strict:true,schema:ask.schema}}});
  await budget.beforeRequest(bodyJson);sent=true;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${config.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(ask.timeoutMs||15000),body:bodyJson});
  if(!response.ok){await settle({status:[400,401,403,404,422,429].includes(response.status)?'rejected':'uncertain',httpStatus:response.status});return null;}
  const result=await response.json() as {id?:string;usage?:{input_tokens:number;output_tokens:number};output?:{type:string;content?:{type:string;text?:string}[]}[]};
  await settle({status:'completed',usage:result.usage,responseId:result.id,httpStatus:response.status});
  const raw=result.output?.filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('').trim();
  try{const parsed=JSON.parse(raw||'');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}
 }catch{
  if(sent&&!accounted)try{await settle({status:'uncertain'});}catch{/* The hold stays reserved. */}
  return null;
 }
}
