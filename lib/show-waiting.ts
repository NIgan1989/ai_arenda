import {MIN_PHOTOS} from './listing-rules';
import {q,one,uuid,epoch} from './operation-core';

// Publication audit 2026-11-22: a flat is «на карте» only when guests can really find it there. A person's approval
// shows it when it has a full description, three photos and a point for its current address; otherwise it waits here
// and is shown by itself the moment the owner adds what is missing (the point, the photos).
const fingerprint=(p:string)=>`COALESCE(${p}.city,'')||'|'||COALESCE(${p}.district,'')||'|'||COALESCE(${p}.address,'')`;
export const mappedSql=(p='properties')=>`EXISTS(SELECT 1 FROM property_locations l WHERE l.property_id=${p}.id AND l.address_fingerprint=${fingerprint(p)})`;
export const showableSql=(p='properties')=>`length(${p}.description)>=80 AND COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=${p}.id),0)>=${MIN_PHOTOS} AND ${mappedSql(p)}`;

// What is still missing, in the words the owner reads.
export async function showMissing(db:D1Database,propertyId:string){
 const f=await one(db,`SELECT length(p.description) len,COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=p.id),0) photos,${mappedSql('p')} mapped,
  EXISTS(SELECT 1 FROM pilot_policy WHERE id='global' AND require_phone=1) AND NOT EXISTS(SELECT 1 FROM phone_verifications v WHERE v.user_id=p.owner_id AND v.verified_at IS NOT NULL) phone FROM properties p WHERE p.id=?`,propertyId);
 if(!f)return [];
 return [f.len<80&&'дописать описание до 80 знаков',f.photos<MIN_PHOTOS&&'добавить фото: нужно не меньше '+MIN_PHOTOS+', сейчас '+f.photos,!f.mapped&&'поставить адрес на карту: «Моё жильё» → «Изменить» → «Адрес»',!!f.phone&&'подтвердить телефон в профиле'].filter(Boolean) as string[];
}
// Shows an approved flat that waited for its point or photos. A failed rule of the platform keeps it waiting.
export async function showWaiting(db:D1Database,propertyId:string){
 const w=await one(db,'SELECT w.review_id,p.owner_id,p.title FROM show_waiting w JOIN properties p ON p.id=w.property_id WHERE w.property_id=? AND p.archived_at IS NULL',propertyId);if(!w)return false;
 try{
  const r=await q(db,`UPDATE properties SET published=1 WHERE id=? AND published=0 AND ${showableSql('properties')}`,propertyId).run();
  if(!r.meta.changes)return false;
 }catch(e){if(/pilot_|property_archived/.test(String((e as Error)?.message)))return false;throw e;}
 const at=epoch();
 await db.batch([
  q(db,'UPDATE property_details SET version=version+1 WHERE property_id=?',propertyId),
  q(db,'DELETE FROM show_waiting WHERE property_id=?',propertyId),
  q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),w.owner_id,'«'+(w.title||'Жильё')+'» показано гостям на карте.','owner:shown:'+w.review_id,at)]);
 return true;
}
