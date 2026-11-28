import {one,type Row} from './operation-core';
import {pilotPropertyVisibleSql} from './pilot-governance';
import {ratingsFor} from './stay-reviews';
import {isHourlyVenue,isVenue} from './listings';
import {SHARE_ID,type ShareCard} from './stay-share-text';
export * from './stay-share-text';

// A published place that guests may see now (the same rule as the catalog), without demo places.
export async function shareCard(db:D1Database,id:string):Promise<ShareCard|null>{
 if(!SHARE_ID.test(id))return null;
 const p=await one(db,`SELECT p.id,p.title,p.city,p.district,p.price,json_extract(d.details,'$.type') type,d.photos,pp.hourly_price FROM properties p LEFT JOIN property_details d ON d.property_id=p.id LEFT JOIN property_policies pp ON pp.property_id=p.id
  WHERE p.id=? AND p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL AND ${pilotPropertyVisibleSql('p')}`,id) as Row|null;
 if(!p)return null;
 let photos:unknown=[];try{photos=JSON.parse(String(p.photos||'[]'));}catch{/* no photo */}
 const type=String(p.type||''),bath=isHourlyVenue(type),hall=isVenue(type)&&!bath;
 const price=bath?Number(p.hourly_price)||0:hall?0:Number(p.price)||0;
 const rating=(await ratingsFor(db,[String(p.id)])).get(String(p.id)) as {average?:number;count?:number}|undefined;
 return {id:String(p.id),title:String(p.title||''),city:String(p.city||''),district:String(p.district||''),price,unit:price?(bath?'hour':'day'):'',photo:Array.isArray(photos)&&typeof photos[0]==='string'?photos[0]:'',rating:rating&&Number(rating.count)>0?{average:Number(rating.average),count:Number(rating.count)}:null};
}

// The photo of the preview as plain bytes, for WhatsApp and Telegram (they do not read data URLs).
export function dataUrlBytes(data:string){
 const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);if(!m)return null;
 const raw=atob(m[2]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return {type:m[1],bytes};
}
