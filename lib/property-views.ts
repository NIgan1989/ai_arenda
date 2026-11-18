import {q,type Row} from './operation-core';

// «Показы»: how many times guests saw the card of a place in the search. The phone reports the cards a guest
// actually had on screen, once for each answer of the search; the server keeps one number per object per day
// and nothing about the guest. The owner sees the last seven days on the object's card (service.ts views_week).
export const VIEW_DAYS=7,VIEW_KEEP_DAYS=30,VIEW_BATCH=60;
// The day in Kazakhstan time (UTC+5), as a whole number of days.
export const viewDay=(at:number)=>Math.floor((at+18000)/86400);
/** The ids worth counting from what a phone sent: strings, each once, no more than one search answer holds. */
export function viewIds(input:unknown):string[]{
 const list=Array.isArray((input as Row)?.ids)?(input as Row).ids as unknown[]:[];
 return [...new Set(list.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=64))].slice(0,VIEW_BATCH);
}
/** Adds one showing to each of these published places for today and drops the days no longer shown to anyone. */
export async function recordViews(db:D1Database,input:unknown,at=Math.floor(Date.now()/1000)){
 const ids=viewIds(input),day=viewDay(at);
 if(!ids.length)return {counted:0};
 const done=await db.batch([
  q(db,`INSERT INTO property_views(property_id,day,shown) SELECT id,?,1 FROM properties WHERE published=1 AND archived_at IS NULL AND id IN (${ids.map(()=>'?').join(',')}) ON CONFLICT(property_id,day) DO UPDATE SET shown=shown+1`,day,...ids),
  q(db,'DELETE FROM property_views WHERE day<?',day-VIEW_KEEP_DAYS),
 ]);
 return {counted:Number(done[0]?.meta?.changes)||0};
}
