import {rows} from './operation-core';
import {ANALYTICS_PERIODS,DAY,analyticsPeriod,buildOwnerAnalytics,monthStart} from './owner-analytics';

/** Loads the owner's own rows for the period, the one before it and six calendar months, and counts. */
export async function ownerAnalytics(db:D1Database,owner:string,periodValue:unknown,now=Math.floor(Date.now()/1000)){
 const period=analyticsPeriod(periodValue),days=ANALYTICS_PERIODS.find(p=>p.id===period)!.days;
 // Enough history for the previous period, the six months and the returning guests' year.
 const since=Math.min(now-2*days*DAY,monthStart(now,5)),guestsSince=since-365*DAY;
 const [places,bookings,jobs,commissions,jobCommissions,plans,expenses,reviews,views]=await Promise.all([
  rows(db,"SELECT p.id,p.title,p.created_at,p.archived_at,json_extract(d.details,'$.type') type FROM properties p LEFT JOIN property_details d ON d.property_id=p.id WHERE p.owner_id=? AND p.demo_owner IS NULL",owner),
  rows(db,'SELECT b.id,b.property_id,b.guest_id,b.start,b.end,b.amount,b.status,b.created_at FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND p.demo_owner IS NULL AND (b.end>=? OR b.created_at>=?) ORDER BY b.start LIMIT 5000',owner,guestsSince,since),
  rows(db,"SELECT property_id,start,fee,status,cancel_fee,assigned_to FROM cleaning_jobs WHERE owner_id=? AND start>=? AND status IN ('completed','cancelled') LIMIT 5000",owner,since),
  rows(db,"SELECT c.property_id,c.amount,b.start at FROM platform_commissions c JOIN bookings b ON b.id=c.booking_id WHERE c.owner_id=? AND c.mode='charged' AND b.status IN ('confirmed','completed') AND b.start>=?",owner,since),
  rows(db,"SELECT c.property_id,c.amount,j.start at FROM cleaning_commissions c JOIN cleaning_jobs j ON j.id=c.job_id WHERE c.owner_id=? AND c.mode='charged' AND j.start>=?",owner,since),
  rows(db,"SELECT period_start,amount FROM autopilot_charges WHERE user_id=? AND role='owner' AND mode='charged' AND period_start>=?",owner,since),
  rows(db,"SELECT property_id,amount,created_at FROM finance_entries WHERE owner_id=? AND kind IN ('expense','compensation') AND created_at>=?",owner,since),
  rows(db,'SELECT property_id,rating,created_at FROM stay_reviews WHERE owner_id=? AND created_at>=?',owner,since),
  rows(db,'SELECT v.property_id,v.day,v.shown FROM property_views v JOIN properties p ON p.id=v.property_id WHERE p.owner_id=?',owner),
 ]);
 return buildOwnerAnalytics({now,owner,places,bookings,jobs,commissions:[...commissions,...jobCommissions],plans,expenses,reviews,views},period);
}
