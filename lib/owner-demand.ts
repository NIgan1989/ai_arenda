import type {RentalService} from './service';
import {rows,epoch,type Row} from './operation-core';

// Demand around the owner's flats for the live map: where guests have asked and booked in the last two weeks.
// Nothing about a guest leaves here. A request counts at the approximate point of the flat that was asked
// (the same 1 km cell the public catalogue shows), never at the point the guest searched from, and the owner
// sees only shares of the busiest cell, not counts per flat.
export const DEMAND_DAYS=14,ASK_WEIGHT=1,BOOK_WEIGHT=3;
export type DemandCell={longitude:number;latitude:number;weight:number};

// Flats with their asks and bookings, summed per public cell and scaled so the busiest cell is 1.
export function demandCells(flats:{longitude:number;latitude:number;asks:number;books:number}[]):DemandCell[]{
 const cells=new Map<string,DemandCell>();
 for(const f of flats){
  const weight=ASK_WEIGHT*Math.max(0,Number(f.asks)||0)+BOOK_WEIGHT*Math.max(0,Number(f.books)||0);
  if(!weight||!Number.isFinite(f.longitude)||!Number.isFinite(f.latitude))continue;
  // The centre of the public 0.01° cell, as publicPoint in map-workspace.ts.
  const p={longitude:Math.floor(f.longitude/.01)*.01+.005,latitude:Math.floor(f.latitude/.01)*.01+.005},key=p.longitude.toFixed(3)+':'+p.latitude.toFixed(3),cell=cells.get(key);
  if(cell)cell.weight+=weight;else cells.set(key,{longitude:Number(p.longitude.toFixed(3)),latitude:Number(p.latitude.toFixed(3)),weight});
 }
 const all=[...cells.values()],top=Math.max(0,...all.map(c=>c.weight));
 return top?all.map(c=>({...c,weight:Math.round(c.weight/top*100)/100})).sort((a,b)=>b.weight-a.weight):[];
}

const same=(a:unknown,b:unknown)=>String(a||'').trim().toLocaleLowerCase('ru')===String(b||'').trim().toLocaleLowerCase('ru');
const fingerprint=(p:Row)=>[p.city,p.district,p.address].join('|');

// cells: the heat of the city; searching: how many guests in this city are waiting for an owner's answer right now.
export async function ownerDemand(s:RentalService,city:string,now=epoch()){
 const since=now-DEMAND_DAYS*86400;
 // One pass over the offers and the bookings of the window, grouped by object, instead of a count per object.
 const flats=await rows(s.db,`SELECT p.id,p.city,p.district,p.address,l.longitude,l.latitude,l.address_fingerprint
  FROM properties p JOIN property_locations l ON l.property_id=p.id WHERE p.published=1 AND p.demo_owner IS NULL`);
 const here=flats.filter((f:Row)=>same(f.city,city)&&f.address_fingerprint===fingerprint(f));
 const asks=new Map<string,number>(),books=new Map<string,number>();
 if(here.length){
  for(const r of await rows(s.db,'SELECT property_id,COUNT(*) n FROM matching_offers WHERE created_at>? GROUP BY property_id',since))asks.set(r.property_id,Number(r.n));
  for(const r of await rows(s.db,"SELECT property_id,COUNT(*) n FROM bookings WHERE created_at>? AND status NOT IN ('cancelled','rejected','expired') GROUP BY property_id",since))books.set(r.property_id,Number(r.n));
 }
 const cells=demandCells(here.map((f:Row)=>({longitude:Number(f.longitude),latitude:Number(f.latitude),asks:asks.get(f.id)||0,books:books.get(f.id)||0})));
 // Guests still waiting for an owner's answer: a request stays «ready» after the first yes while other owners are asked.
 const live=await rows(s.db,"SELECT r.filters FROM matching_requests r WHERE r.status IN ('searching','ready') AND r.expires_at>? AND EXISTS(SELECT 1 FROM matching_offers o WHERE o.request_id=r.id AND o.status='pending' AND o.expires_at>?)",now,now);
 const searching=live.filter((r:Row)=>{try{return same(JSON.parse(r.filters).city,city);}catch{return false;}}).length;
 return {cells,searching};
}
