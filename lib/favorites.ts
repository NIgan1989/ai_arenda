import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {q,one,rows,epoch,type Row} from './operation-core';
import {pilotPropertyVisibleSql} from './pilot-governance';

// «Избранное» гостя: homes the guest marked with a heart, and homes the guest has already stayed in
// («Снова туда же»). Both come first in the guest's search and are asked first when owners are asked.
// A favourite is the guest's own note: the owner is not told, and nothing is promised about availability.
export const MAX_FAVORITES=50;

/** Ids of the guest's favourites (newest first) and of the homes of the guest's finished stays (latest first). */
export async function guestFavorites(db:D1Database,userId:string):Promise<{favorites:string[];stayed:string[]}>{
 // One query for both lists: the state and the start of a search have a budget of database queries.
 const visible=pilotPropertyVisibleSql('p'),shown=`p.published=1 AND p.archived_at IS NULL AND ${visible}`;
 const found=await rows(db,`SELECT * FROM (SELECT 'favorite' kind,f.property_id id,f.created_at at FROM guest_favorites f JOIN properties p ON p.id=f.property_id WHERE f.guest_id=? AND ${shown}
  UNION ALL SELECT 'stayed' kind,b.property_id id,MAX(b.end) at FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? AND b.status='completed' AND p.demo_owner IS NULL AND ${shown} GROUP BY b.property_id) ORDER BY kind,at DESC,id`,userId,userId);
 const of=(kind:string)=>found.filter(r=>r.kind===kind).map(r=>String(r.id));
 return {favorites:of('favorite'),stayed:of('stayed').slice(0,20)};
}

/** The heart: on or off. Only a published home another person owns; at most MAX_FAVORITES of them. */
export async function setFavorite(s:RentalService,body:Row){
 await s.requireRole('guest');
 const propertyId=required(body.propertyId,'Жильё',100);
 if(typeof body.on!=='boolean')throw new DomainError('Укажите, добавить или убрать из избранного.');
 if(!body.on){await q(s.db,'DELETE FROM guest_favorites WHERE guest_id=? AND property_id=?',s.userId,propertyId).run();return {...await guestFavorites(s.db,s.userId),message:'Убрано из избранного.'};}
 const p=await one(s.db,`SELECT p.id,p.owner_id FROM properties p WHERE p.id=? AND p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL AND ${pilotPropertyVisibleSql('p')}`,propertyId);
 if(!p)throw new DomainError('Жильё недоступно.',404);
 if(p.owner_id===s.userId)throw new DomainError('Своё жильё в избранное не добавляют.',409);
 // Only what the guest can see and take back counts: a home that left the catalogue does not use up the allowance.
 const shown=(await guestFavorites(s.db,s.userId)).favorites;
 if(!shown.includes(propertyId)&&shown.length>=MAX_FAVORITES)throw new DomainError('В избранном уже '+MAX_FAVORITES+' объектов. Уберите лишние.',409);
 await q(s.db,'INSERT OR IGNORE INTO guest_favorites(guest_id,property_id,created_at) VALUES (?,?,?)',s.userId,propertyId,epoch()).run();
 return {...await guestFavorites(s.db,s.userId),message:'Добавлено в избранное.'};
}

/**
 * The guest's own homes first: favourites, then homes of earlier stays, each group in the order the ranking gave.
 * The rest keep their order. Used where owners are asked, so that a home the guest chose is asked before the others.
 */
export function favouredFirst<T extends {id:string}>(properties:T[],mine:{favorites:string[];stayed:string[]}):T[]{
 const fav=new Set(mine.favorites),stayed=new Set(mine.stayed);
 const rank=(p:T)=>fav.has(p.id)?0:stayed.has(p.id)?1:2;
 return properties.map((p,i)=>({p,i})).sort((a,b)=>rank(a.p)-rank(b.p)||a.i-b.i).map(v=>v.p);
}
