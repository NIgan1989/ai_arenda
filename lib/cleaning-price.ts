import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {feeTipText,money} from './cleaning-tip-text';
export {feeTipText};

// Cleaning price. Two signs that a flat's cleaning is priced too low: cleaners keep refusing it at that
// price, or owners of similar flats in the same city pay clearly more. Then the AI administrator suggests
// one new price, once. It changes only by the owner's button; open cleanings are offered again at it.
export const FEE_LOOKBACK=90*86400,FEE_REFUSED_WINDOW=14*86400,FEE_TTL=7*86400,FEE_PAUSE=3*86400,FEE_DECLINE_PAUSE=30*86400,FEE_MIN_SAMPLES=3,FEE_MIN_REFUSED=2;
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2);};
const round500=(n:number)=>Math.round(n/500)*500,up500=(n:number)=>Math.ceil(n/500)*500;

export type FeeSignals={fee:number;typical:number;samples:number;refused:number;accepted:number};
export type FeeAdvice={to:number;reason:'refused'|'below'};
export function adviseCleaningFee(s:FeeSignals):FeeAdvice|null{
 if(s.fee<=0)return null;
 const known=s.samples>=FEE_MIN_SAMPLES&&s.typical>0;
 // Refused again and again at this price, and nobody took it: a step up, at least to what others pay.
 if(s.refused>=FEE_MIN_REFUSED&&!s.accepted){
  const to=Math.min(Math.max(up500(s.fee*1.2),known?round500(s.typical):0),s.fee*2);
  return to>s.fee?{to,reason:'refused'}:null;
 }
 // Well below what similar flats in the city pay: up to that price.
 if(known&&s.fee<s.typical*.8){const to=Math.min(round500(s.typical),s.fee*2);return to>s.fee?{to,reason:'below'}:null;}
 return null;
}

// What owners pay for cleaning similar flats (one room more or fewer) in the city, from finished cleanings.
async function signalsFor(db:D1Database,property:Row,fee:number,t:number):Promise<FeeSignals>{
 const fees=(await rows(db,`SELECT j.fee FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status='completed' AND j.property_id<>? AND p.city=? AND p.rooms BETWEEN ? AND ? AND p.demo_owner IS NULL AND j.created_at>? AND j.fee>=100`,property.id,property.city,Number(property.rooms)-1,Number(property.rooms)+1,t-FEE_LOOKBACK)).map(r=>Number(r.fee));
 const answers=await one(db,`SELECT SUM(o.status IN ('declined','expired')) refused,SUM(o.status='accepted') accepted FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id WHERE j.property_id=? AND o.fee=? AND o.created_at>?`,property.id,fee,t-FEE_REFUSED_WINDOW);
 return {fee,typical:fees.length?median(fees):0,samples:fees.length,refused:Number(answers?.refused||0),accepted:Number(answers?.accepted||0)};
}

const expireSql="UPDATE cleaning_fee_tips SET status='expired',decided_at=? WHERE status='suggested' AND (expires_at<=? OR NOT EXISTS(SELECT 1 FROM property_policies pp WHERE pp.property_id=cleaning_fee_tips.property_id AND pp.cleaning_fee=cleaning_fee_tips.from_fee))";

export async function offerCleaningPriceTip(db:D1Database,ownerId:string,t=epoch()):Promise<string|null>{
 await q(db,expireSql+' AND owner_id=?',t,t,ownerId).run();
 if(await one(db,"SELECT 1 FROM cleaning_fee_tips WHERE owner_id=? AND (status='suggested' OR created_at>?)",ownerId,t-FEE_PAUSE))return null;
 const flats=await rows(db,"SELECT p.id,p.title,p.city,p.rooms,pp.cleaning_fee,pp.version FROM properties p JOIN property_policies pp ON pp.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL AND p.demo_owner IS NULL AND pp.cleaning_fee>0 ORDER BY p.created_at",ownerId);
 for(const property of flats){
  if(await one(db,"SELECT 1 FROM cleaning_fee_tips WHERE property_id=? AND status='declined' AND decided_at>?",property.id,t-FEE_DECLINE_PAUSE))continue;
  const signals=await signalsFor(db,property,Number(property.cleaning_fee),t),advice=adviseCleaningFee(signals);
  if(!advice)continue;
  const id=uuid(),tip={from_fee:signals.fee,to_fee:advice.to,typical:signals.samples>=FEE_MIN_SAMPLES?signals.typical:0,refused:advice.reason==='refused'?signals.refused:0};
  const body='Цена уборки · «'+property.title+'». '+feeTipText(tip)+' Без вашего согласия цена не изменится.';
  const r=await db.batch([
   q(db,`INSERT INTO cleaning_fee_tips(id,property_id,owner_id,from_fee,to_fee,typical,samples,refused,policy_version,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM cleaning_fee_tips WHERE owner_id=? AND (status='suggested' OR created_at>?))`,
    id,property.id,ownerId,tip.from_fee,tip.to_fee,tip.typical,signals.samples,tip.refused,property.version,t,t+FEE_TTL,ownerId,t-FEE_PAUSE),
   q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_fee_tips WHERE id=?)',uuid(),ownerId,body,'owner:cleaning-fee:'+id,t,id),
   q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cleaning_fee_tips WHERE id=?)',uuid(),'system:cleaning-price',property.id,JSON.stringify({action:'cleaning.fee_tip',tipId:id,from:tip.from_fee,to:tip.to_fee,typical:tip.typical,refused:tip.refused,reason:advice.reason,onBehalfOf:ownerId}),t,id)
  ]);
  return r[0].meta.changes?id:null;
 }
 return null;
}

const tipCols='c.*,p.title,pp.cleaning_fee current_fee,pp.version current_policy FROM cleaning_fee_tips c JOIN properties p ON p.id=c.property_id LEFT JOIN property_policies pp ON pp.property_id=c.property_id';
export async function ownerCleaningTips(db:D1Database,ownerId:string,t=epoch()){
 await q(db,expireSql+' AND owner_id=?',t,t,ownerId).run();
 return rows(db,"SELECT "+tipCols+" WHERE c.owner_id=? AND c.status='suggested' AND c.expires_at>? ORDER BY c.created_at DESC LIMIT 3",ownerId,t);
}

export async function decideCleaningTip(s:RentalService,tipId:string,accept:boolean){
 const t=epoch(),id=required(tipId,'Совет',100);
 const tip=await one(s.db,"SELECT "+tipCols+" WHERE c.id=? AND c.owner_id=?",id,s.userId);
 if(!tip)throw new DomainError('Совет недоступен.',404);
 if(tip.status!=='suggested'||tip.expires_at<=t||tip.current_fee!==tip.from_fee)throw new DomainError('Совет уже неактуален: цена уборки изменилась.',409);
 if(!accept){
  const r=await s.db.batch([
   q(s.db,"UPDATE cleaning_fee_tips SET status='declined',decided_at=? WHERE id=? AND status='suggested'",t,id),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),s.userId,tip.property_id,JSON.stringify({action:'cleaning.fee_declined',tipId:id}),t)
  ]);
  if(!r[0].meta.changes)throw new DomainError('Совет уже закрыт.',409);
  return {message:'Хорошо, цену уборки оставляю. Месяц об этом не напомню.'};
 }
 const revision=uuid(),r=await s.db.batch([
  q(s.db,"UPDATE property_policies SET cleaning_fee=?,cleaning_budget=MAX(cleaning_budget,?),version=version+1,revision=?,updated_at=? WHERE property_id=? AND cleaning_fee=? AND EXISTS(SELECT 1 FROM cleaning_fee_tips WHERE id=? AND status='suggested')",tip.to_fee,tip.to_fee,revision,t,tip.property_id,tip.from_fee,id),
  // Open cleanings that nobody has taken yet go out again at the new price.
  q(s.db,"UPDATE cleaning_jobs SET fee=? WHERE property_id=? AND status='open' AND assigned_to IS NULL AND fee<? AND end>? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)",tip.to_fee,tip.property_id,tip.to_fee,t,tip.property_id,revision),
  q(s.db,"UPDATE cleaning_fee_tips SET status='accepted',decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)",t,id,tip.property_id,revision),
  q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',uuid(),s.userId,tip.property_id,JSON.stringify({action:'cleaning.fee_accepted',tipId:id,from:tip.from_fee,to:tip.to_fee,version:tip.current_policy+1}),t,tip.property_id,revision)
 ]);
 if(!r[0].meta.changes)throw new DomainError('Цена уборки уже изменилась. Обновите экран.',409);
 const reopened=r[1].meta.changes;
 return {message:'Готово: уборка в «'+tip.title+'» теперь '+money(tip.to_fee)+'.'+(reopened?' '+(reopened===1?'Открытую уборку':'Открытые уборки ('+reopened+')')+' предложу исполнителям заново по новой цене.':'')};
}
