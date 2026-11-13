import {epoch,q,one,type Row} from './operation-core';
import type {BookingRisk,RiskLevel} from './booking-risk-text';
export {riskAdvice,riskLabel} from './booking-risk-text';
export type {BookingRisk,RiskLevel};

// Booking risk: the AI administrator looks at the guest's history and the request itself
// and tells the owner whether to confirm as is, take a deposit or ask for a verified phone.
// It never refuses a guest on its own; under autopilot a high risk only stops the
// automatic confirmation and hands the request to the owner.
export type RiskSignals={phone:boolean;completed:number;disputes:number;cancels:number;accountAge:number;lead:number;nightHourly:boolean;price:number;deposit:number};
const DAY=86400;
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return a===1&&b!==11?one:a>=2&&a<=4&&(b<12||b>14)?few:many;};
const round1000=(n:number)=>Math.round(n/1000)*1000;

export function assessBookingRisk(s:RiskSignals):BookingRisk{
 let score=0;const reasons:string[]=[];
 if(s.disputes>0){score+=3;reasons.push(s.disputes===1?'был спор при выезде':s.disputes+' '+plural(s.disputes,'спор','спора','споров')+' при выезде');}
 if(!s.phone){score+=2;reasons.push('телефон не подтверждён');}
 if(s.completed===0){score+=1;reasons.push('первая бронь в сервисе');}
 else if(!s.disputes){const k=s.completed>=3?2:1;score-=k;reasons.push(s.completed+' '+plural(s.completed,'проживание','проживания','проживаний')+' без замечаний');}
 if(s.cancels>=2){score+=1;reasons.push(s.cancels+' '+plural(s.cancels,'отмена','отмены','отмен')+' после подтверждения');}
 if(s.accountAge<DAY){score+=1;reasons.push('аккаунт создан сегодня');}
 if(s.lead<3*3600){score+=1;reasons.push('заезд меньше чем через 3 часа');}
 if(s.nightHourly){score+=1;reasons.push('почасовая бронь на ночь');}
 if(s.phone&&!reasons.includes('телефон не подтверждён'))reasons.push('телефон подтверждён');
 const level:RiskLevel=score>=5?'high':score>=2?'medium':'low';
 // A refundable deposit: half a day's price for a medium risk, a full day for a high one.
 const deposit=level==='low'||s.deposit>0?0:Math.max(5000,Math.min(50000,round1000(s.price*(level==='high'?1:0.5))));
 return {level,score,reasons:reasons.slice(0,4),deposit,phone:s.phone};
}

const localHour=(t:number)=>Number(new Date(t*1000).toLocaleString('en-GB',{timeZone:'Asia/Almaty',hour:'2-digit',hour12:false}))%24;

export async function riskSignals(db:D1Database,guestId:string,booking:{start:number;end:number;billingMode:string;price:number;deposit:number},t=epoch()):Promise<RiskSignals>{
 const g=await one(db,`SELECT p.created_at,
  EXISTS(SELECT 1 FROM phone_verifications v WHERE v.user_id=p.id AND v.verified_at IS NOT NULL) phone,
  (SELECT COUNT(*) FROM bookings WHERE guest_id=p.id AND status='completed') completed,
  (SELECT COUNT(DISTINCT a.entity_id) FROM audit_events a JOIN bookings b ON b.id=a.entity_id WHERE b.guest_id=p.id AND a.action LIKE '%booking.checkout_disputed%') disputes,
  (SELECT COUNT(DISTINCT a.entity_id) FROM audit_events a JOIN bookings b ON b.id=a.entity_id WHERE a.actor_id=p.id AND b.guest_id=p.id AND a.action='booking.cancelled' AND EXISTS(SELECT 1 FROM audit_events c WHERE c.entity_id=a.entity_id AND c.action LIKE '%booking.confirmed%' AND c.created_at<=a.created_at)) cancels
  FROM profiles p WHERE p.id=?`,guestId)||{} as Row;
 const h=localHour(booking.start);
 return {phone:!!g.phone,completed:Number(g.completed||0),disputes:Number(g.disputes||0),cancels:Number(g.cancels||0),accountAge:t-Number(g.created_at||t),lead:booking.start-t,
  nightHourly:booking.billingMode==='hourly'&&(h>=22||h<5),price:booking.price,deposit:booking.deposit};
}

export function saveRiskSql(db:D1Database,bookingId:string,propertyId:string,guestId:string,ownerId:string,r:BookingRisk,t=epoch()){
 return q(db,'INSERT OR IGNORE INTO booking_risks(booking_id,property_id,guest_id,owner_id,level,score,reasons,deposit_advice,phone_verified,held,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=?)',bookingId,propertyId,guestId,ownerId,r.level,r.score,JSON.stringify(r.reasons),r.deposit,r.phone?1:0,r.held?1:0,t,bookingId);
}

export const riskFromRow=(row:Row|null|undefined):BookingRisk|undefined=>{
 if(!row)return undefined;
 let reasons:string[]=[];try{reasons=JSON.parse(row.reasons||'[]');}catch{}
 return {level:row.level,score:row.score,reasons,deposit:row.deposit_advice,phone:!!row.phone_verified,held:!!row.held};
};
