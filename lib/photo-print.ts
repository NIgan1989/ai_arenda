import {epoch,uuid,q,one,rows} from './operation-core';

// «Фото не повторяют другой объект» (fraud check, step 2, 2026-11-26). A scammer copies the photos of a real home,
// often of one already in the service, and shows them as his own. Every photo of a home gets a print: the photo shrunk
// to 9×8 grey dots, where each bit says whether a dot is brighter than the one to its right (difference hash).
// A photo saved again, shrunk, or screenshotted keeps nearly the same print; another room does not. Two homes of
// different owners whose photos share a print go to the administrator, who looks at both. Nothing is refused by itself.
// The prints are made in the background (lib/photo-decode.ts), so the photo decoder stays out of the request path.
export const PRINT_DISTANCE=6;

/** How many of the 64 bits differ. */
export function printDistance(a:string,b:string){
 if(a.length!==16||b.length!==16)return 64;
 let n=0;for(let i=0;i<16;i++){let x=parseInt(a[i],16)^parseInt(b[i],16);while(x){n+=x&1;x>>=1;}}
 return n;
}
export const samePhoto=(a:string,b:string)=>!!a&&!!b&&printDistance(a,b)<=PRINT_DISTANCE;

export type PhotoTwin={propertyId:string;title:string;ownerId:string;photoId:string;otherPhotoId:string};
/** The photos of this home that repeat a photo of a home of another owner (any home, shown or not, except training ones). */
export async function photoTwins(db:D1Database,propertyId:string):Promise<PhotoTwin[]>{
 const mine=await rows(db,"SELECT f.value photo,m.print FROM property_details d JOIN properties p ON p.id=d.property_id,json_each(d.photos) f JOIN media_prints m ON m.media_id=f.value WHERE d.property_id=? AND p.demo_owner IS NULL AND m.print<>''",propertyId);
 if(!mine.length)return [];
 const owner=(await one(db,'SELECT owner_id FROM properties WHERE id=?',propertyId))?.owner_id;
 // Rooms of one type (lib/room-units.ts) copy their card's photos: they are the same owner's, so they never count.
 const others=await rows(db,"SELECT p.id,p.title,p.owner_id,f.value photo,m.print FROM properties p JOIN property_details d ON d.property_id=p.id,json_each(d.photos) f JOIN media_prints m ON m.media_id=f.value WHERE p.owner_id<>? AND p.demo_owner IS NULL AND m.print<>''",owner);
 const found:PhotoTwin[]=[];
 for(const m of mine)for(const o of others)if(samePhoto(m.print,o.print)&&!found.some(t=>t.photoId===m.photo&&t.propertyId===o.id))found.push({propertyId:o.id,title:o.title||'жильё',ownerId:o.owner_id,photoId:m.photo,otherPhotoId:o.photo});
 return found;
}
export function twinsNote(twins:PhotoTwin[]){
 const homes=[...new Map(twins.map(t=>[t.propertyId,t.title])).values()];
 return 'Фото ('+new Set(twins.map(t=>t.photoId)).size+') повторяют фото другого владельца: «'+homes.slice(0,3).join('», «')+'»'+(homes.length>3?' и ещё '+(homes.length-3):'')+'. Сравните снимки, прежде чем одобрять';
}

// Tells the platform administrators once about each shown home whose photos repeat another owner's home.
export async function sweepTwins(db:D1Database,admins:string[]){
 let told=0;
 if(!admins.length)return {told};
 // Only homes whose photos changed since the last look: a print or a photo list newer than the last note about the home.
 const shown=await rows(db,`SELECT p.id,p.title FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.published=1 AND p.demo_owner IS NULL AND p.archived_at IS NULL
  AND EXISTS(SELECT 1 FROM json_each(d.photos) f JOIN media_prints m ON m.media_id=f.value WHERE m.print<>'' AND MAX(m.created_at,d.updated_at)>COALESCE((SELECT MAX(a.created_at) FROM audit_events a WHERE a.entity_id=p.id AND a.action='photos.twins_checked'),0)) LIMIT 20`);
 const at=epoch();
 for(const p of shown){
  const twins=await photoTwins(db,p.id);
  const writes=[q(db,"INSERT INTO audit_events VALUES (?,'ai-administrator',?,'photos.twins_checked',?)",uuid(),p.id,at)];
  if(twins.length){
   for(const a of admins)writes.push(q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),a,'Жильё «'+(p.title||'жильё')+'» показано гостям. '+twinsNote(twins)+'.','admin:photo-twins:'+p.id+':'+twins.map(t=>t.photoId).sort().join(',')+':'+a,at));
   told++;
  }
  await db.batch(writes);
 }
 return {told};
}
