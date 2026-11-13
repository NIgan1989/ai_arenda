import {rows,type Row} from './operation-core';

// Who gets a cleaning first. Of the cleaners who are free and work in the flat's city, the AI administrator
// offers the cleaning to the one most likely to come and do it well: no missed cleanings, answers offers,
// has experience and, best of all, already knows this flat. Pure scoring, so the choice can be checked
// without a database.
export type CleanerStats={id:string;name?:string;completed:number;here:number;noShows:number;accepted:number;refused:number};
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
export function cleanerScore(s:CleanerStats){
 // A small prior: a new cleaner starts trusted, one missed cleaning among many weighs less than among few.
 const reliability=(s.completed+2)/(s.completed+s.noShows+2);
 const response=(s.accepted+1.2)/(s.accepted+s.refused+2);
 const experience=Math.min(s.completed,20)/20,familiar=s.here>0?1:0;
 const score=.35*reliability+.25*response+.25*experience+.15*familiar;
 const reasons=[
  ...(s.here>0?['знает это жильё: '+plural(s.here,'уборка','уборки','уборок')]:[]),
  ...(s.completed>0?[plural(s.completed,'уборка','уборки','уборок')+(s.noShows?', '+plural(s.noShows,'срыв','срыва','срывов'):' без срывов')]:['новый исполнитель']),
  ...(s.accepted+s.refused>=3?['принимает '+Math.round(100*s.accepted/(s.accepted+s.refused))+'% предложений']:[])
 ];
 return {score,reasons};
}
export function rankCleaners(list:CleanerStats[]){
 return list.map(s=>({...s,...cleanerScore(s)})).sort((a,b)=>b.score-a.score||b.completed-a.completed||a.id.localeCompare(b.id));
}
// The record of each candidate: finished cleanings (here and anywhere), missed ones, answers to offers in half a year.
export async function cleanerStats(db:D1Database,candidates:Row[],propertyId:string,t:number):Promise<CleanerStats[]>{
 if(!candidates.length)return [];
 const ids=candidates.map(c=>c.id),marks=ids.map(()=>'?').join(',');
 const [done,missed,offers]=await Promise.all([
  rows(db,`SELECT assigned_to id,COUNT(*) n,SUM(property_id=?) here FROM cleaning_jobs WHERE status='completed' AND assigned_to IN (${marks}) GROUP BY assigned_to`,propertyId,...ids),
  rows(db,`SELECT user_id id,COUNT(*) n FROM notifications WHERE dedupe LIKE 'cleaner:no-show:%' AND user_id IN (${marks}) GROUP BY user_id`,...ids),
  rows(db,`SELECT worker_id id,SUM(status='accepted') accepted,SUM(status IN ('declined','expired')) refused FROM cleaning_offers WHERE worker_id IN (${marks}) AND created_at>? GROUP BY worker_id`,...ids,t-180*86400)
 ]);
 const by=(list:Row[])=>new Map(list.map(r=>[r.id,r]));
 const d=by(done),m=by(missed),o=by(offers);
 return candidates.map(c=>({id:c.id,name:c.name||'',completed:Number(d.get(c.id)?.n||0),here:Number(d.get(c.id)?.here||0),noShows:Number(m.get(c.id)?.n||0),accepted:Number(o.get(c.id)?.accepted||0),refused:Number(o.get(c.id)?.refused||0)}));
}
