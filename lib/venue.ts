import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {accountDeletionColumns} from './account-deletion-inventory';
import {q,one,rows,epoch,uuid,type Row} from './operation-core';
import {hasContacts} from './listing-rules';

/** Guests read the names of the venue and of its halls: no phones, links or requests to pay directly, as in a listing. */
const publicName=(value:string)=>{if(hasContacts(value))throw new DomainError('Уберите из названия телефон, ссылки и просьбы оплатить напрямую: гости бронируют и платят через сервис.',409);return value;};

// «Заведение с залами» (2026-11-17). A bath complex has several steam rooms, a sauna several halls. Each hall is an
// object of its own: its price, its capacity, its calendar, its bookings. The venue is the name they share. The owner
// makes the next hall from one that is already filled in («Добавить зал»): the address, the pin, the photos, the
// rules and the person on shift come with it, the name, the capacity and the price are then set for the new hall.

export const MAX_HALLS=12;
const copy=(table:string,change:Record<string,string>)=>{const cols=accountDeletionColumns[table].split(',');return `INSERT INTO ${table}(${cols.join(',')}) SELECT ${cols.map(c=>change[c]??c).join(',')} FROM ${table} WHERE ${table==='properties'?'id':'property_id'}=?`;};

/** The venue of an object and its halls (the object itself included), or null. */
export async function venueOf(db:D1Database,propertyId:string){
 const v=await one(db,'SELECT v.id,v.title FROM venue_halls h JOIN venues v ON v.id=h.venue_id WHERE h.property_id=?',propertyId);
 if(!v)return null;
 const halls=await rows(db,'SELECT p.id,p.title,p.capacity,p.published FROM venue_halls h JOIN properties p ON p.id=h.property_id WHERE h.venue_id=? AND p.archived_at IS NULL ORDER BY h.created_at,p.title',v.id);
 return {id:v.id,title:v.title,halls};
}
/** venue {id,title,halls} for each object that has one, in one read. Halls that are archived do not count. */
export async function venuesFor(db:D1Database){
 const all=await rows(db,'SELECT h.property_id,v.id,v.title,(SELECT COUNT(*) FROM venue_halls x JOIN properties p ON p.id=x.property_id WHERE x.venue_id=v.id AND p.archived_at IS NULL) halls FROM venue_halls h JOIN venues v ON v.id=h.venue_id');
 return new Map(all.map(r=>[String(r.property_id),{id:r.id,title:r.title,halls:Number(r.halls)}]));
}

export async function addHall(s:RentalService,body:Row){
 await s.requireRole('owner');
 const propertyId=required(body.propertyId,'Объект',100),title=publicName(required(body.title,'Название зала',120)),at=epoch();
 const p=await one(s.db,'SELECT id,title FROM properties WHERE id=? AND owner_id=? AND demo_owner IS NULL AND archived_at IS NULL',propertyId,s.userId);
 if(!p)throw new DomainError('Объект недоступен.',404);
 const venue=await venueOf(s.db,propertyId);
 if(venue&&venue.halls.length>=MAX_HALLS)throw new DomainError('В заведении уже '+MAX_HALLS+' залов. Больше добавить нельзя.',409);
 if((venue?.halls||[p]).some((h:Row)=>String(h.title).trim().toLocaleLowerCase('ru')===title.toLocaleLowerCase('ru')))throw new DomainError('Зал с таким названием уже есть. Назовите новый иначе, например «Малый зал».',409);
 const id=uuid(),venueId=venue?.id||uuid(),venueTitle=venue?.title||publicName(required(body.venueTitle||p.title,'Название заведения',120));
 await s.db.batch([
  // A draft: the owner sets the capacity and the price of the new hall and then shows it to guests.
  q(s.db,copy('properties',{id:'?',title:'?',published:'0',created_at:'?',archived_at:'NULL'}),id,title,at,propertyId),
  q(s.db,copy('property_details',{property_id:'?',version:'1',updated_at:'?'}),id,at,propertyId),
  q(s.db,copy('property_locations',{property_id:'?',version:'1',updated_at:'?'}),id,at,propertyId),
  // The AI's mandate is given for each object by its owner, so it does not come with the copy.
  q(s.db,copy('property_policies',{property_id:'?',version:'1',updated_at:'?',auto_confirm:'0',auto_assign:'0',auto_extension:'0',mandate_until:'0'}),id,at,propertyId),
  q(s.db,"INSERT INTO property_operations(property_id,readiness,active_booking_id,version,note,updated_at) VALUES (?,'ready',NULL,1,'',?)",id,at),
  q(s.db,'INSERT INTO property_staff(property_id,staff_id,owner_id,created_at) SELECT ?,staff_id,owner_id,? FROM property_staff WHERE property_id=?',id,at,propertyId),
  ...(venue?[]:[q(s.db,'INSERT INTO venues(id,owner_id,title,created_at) VALUES (?,?,?,?)',venueId,s.userId,venueTitle,at),q(s.db,'INSERT INTO venue_halls(property_id,venue_id,created_at) VALUES (?,?,?)',propertyId,venueId,at-1)]),
  q(s.db,'INSERT INTO venue_halls(property_id,venue_id,created_at) VALUES (?,?,?)',id,venueId,at)]);
 return {id,venue:await venueOf(s.db,id),message:'Зал «'+title+'» добавлен черновиком. Укажите его вместимость и цену, затем покажите гостям.'};
}

export async function renameVenue(s:RentalService,body:Row){
 await s.requireRole('owner');
 const propertyId=required(body.propertyId,'Объект',100),title=publicName(required(body.title,'Название заведения',120));
 const done=await q(s.db,'UPDATE venues SET title=? WHERE owner_id=? AND id=(SELECT venue_id FROM venue_halls WHERE property_id=?)',title,s.userId,propertyId).run();
 if(!done.meta?.changes)throw new DomainError('Заведение не найдено.',404);
 return {venue:await venueOf(s.db,propertyId),message:'Заведение теперь называется «'+title+'».'};
}
