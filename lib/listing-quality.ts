import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {amenities} from './listings';
import {tipText,tipStep,money} from './listing-tip-text';
export {tipText,tipStep};

// Listing quality. The AI administrator compares the owner's flat with similar flats in the same city
// that were booked more often over the last 60 days, and names one concrete difference: fewer photos,
// a missing amenity the others list, no hourly price, meeting guests in person, a short description.
// One tip at a time, with one button. A missing amenity or an hourly price is set by the button itself
// (only when the owner confirms it is true); the rest opens the right step of the listing editor.

export type TipKind='photos'|'amenity'|'hourly'|'checkin'|'text';
export type ListingStats={id:string;title:string;price:number;hourly:number;minimumRate?:number;photos:number;description:number;amenities:string[];checkin:string;bookings:number};
export type ListingTip={kind:TipKind;subject:string;mine:number;theirs:number;count:number;leaders:number;value:number};

export const TIP_LOOKBACK=60*86400,TIP_TTL=7*86400,TIP_PAUSE=3*86400,TIP_DECLINE_PAUSE=60*86400,TIP_REPEAT_PAUSE=30*86400,MIN_LEADERS=3;
const median=(n:number[])=>{const s=[...n].sort((a,b)=>a-b),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):0;};
// Amenities guests look for first: the order breaks ties between equally common ones.
const AMENITY_ORDER=['wifi','kitchen','washer','aircon','parking','linen','towels','elevator','balcony','workspace','tv','hairdryer','iron','crib'];

// Pure: the most useful difference between the flat and the leaders, or null. `skip` holds «kind:subject»
// keys the owner answered recently.
export function listingTip(mine:ListingStats,leaders:ListingStats[],skip:Set<string>=new Set()):ListingTip|null{
 if(leaders.length<MIN_LEADERS)return null;
 const n=leaders.length,ok=(kind:TipKind,subject='')=>!skip.has(kind+':'+subject),tips:ListingTip[]=[];
 const photos=Math.round(median(leaders.map(l=>l.photos)));
 if(photos>=mine.photos+3&&ok('photos'))tips.push({kind:'photos',subject:'',mine:mine.photos,theirs:photos,count:leaders.filter(l=>l.photos>mine.photos).length,leaders:n,value:0});
 const missing=AMENITY_ORDER.filter(a=>amenities[a]&&!mine.amenities.includes(a)&&ok('amenity',a)).map(a=>({a,count:leaders.filter(l=>l.amenities.includes(a)).length})).filter(x=>x.count/n>=0.6).sort((x,y)=>y.count-x.count);
 if(missing.length)tips.push({kind:'amenity',subject:missing[0].a,mine:0,theirs:1,count:missing[0].count,leaders:n,value:0});
 const hourly=leaders.filter(l=>l.hourly>0&&l.price>0);
 if(!mine.hourly&&mine.price>=1000&&hourly.length/n>=0.6&&ok('hourly')){
  // Never below the owner's own minimum rate: such a price could not be saved.
  const value=Math.max(100,mine.minimumRate||0,Math.round(mine.price*median(hourly.map(l=>l.hourly/l.price))/100)*100);
  tips.push({kind:'hourly',subject:'',mine:0,theirs:value,count:hourly.length,leaders:n,value});
 }
 const self=leaders.filter(l=>l.checkin==='lockbox'||l.checkin==='smartlock').length;
 if(mine.checkin==='meet'&&self/n>=0.6&&ok('checkin'))tips.push({kind:'checkin',subject:'',mine:0,theirs:0,count:self,leaders:n,value:0});
 const text=Math.round(median(leaders.map(l=>l.description)));
 if(text>=200&&mine.description<text*0.6&&ok('text'))tips.push({kind:'text',subject:'',mine:mine.description,theirs:text,count:leaders.filter(l=>l.description>mine.description).length,leaders:n,value:0});
 return tips[0]||null;
}

async function statsFor(db:D1Database,where:string,args:unknown[],t:number):Promise<ListingStats[]>{
 return (await rows(db,`SELECT p.id,p.title,p.price,p.description,COALESCE(pp.hourly_price,0) hourly,COALESCE(pp.minimum_rate,0) minimum_rate,COALESCE(d.details,'{}') details,COALESCE(d.photos,'[]') photos,
  (SELECT COUNT(*) FROM bookings b WHERE b.property_id=p.id AND b.status IN ('confirmed','completed') AND b.created_at>?) bookings
  FROM properties p LEFT JOIN property_policies pp ON pp.property_id=p.id LEFT JOIN property_details d ON d.property_id=p.id
  WHERE p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL AND `+where,t-TIP_LOOKBACK,...args)).map(r=>{
  let details:Row={},photos:unknown[]=[];try{details=JSON.parse(r.details);}catch{}try{photos=JSON.parse(r.photos);}catch{}
  return {id:String(r.id),title:String(r.title),price:Number(r.price),hourly:Number(r.hourly),minimumRate:Number(r.minimum_rate),photos:Array.isArray(photos)?photos.length:0,description:String(r.description||'').trim().length,amenities:Array.isArray(details.amenities)?details.amenities:[],checkin:String(details.checkinMethod||'meet'),bookings:Number(r.bookings)};
 });
}

// Flats like this one (same city, rooms ±1, or the whole city when that is too few) booked more often.
async function leadersFor(db:D1Database,property:Row,mine:ListingStats,t:number){
 const near=await statsFor(db,'p.city=? AND p.id<>? AND p.rooms BETWEEN ? AND ?',[property.city,property.id,Number(property.rooms)-1,Number(property.rooms)+1],t);
 let leaders=near.filter(l=>l.bookings>mine.bookings);
 if(leaders.length<MIN_LEADERS)leaders=(await statsFor(db,'p.city=? AND p.id<>?',[property.city,property.id],t)).filter(l=>l.bookings>mine.bookings);
 return leaders.sort((a,b)=>b.bookings-a.bookings).slice(0,5);
}

const expireSql="UPDATE listing_tips SET status='expired',decided_at=? WHERE status='suggested' AND (expires_at<=? OR NOT EXISTS(SELECT 1 FROM properties p WHERE p.id=listing_tips.property_id AND p.published=1 AND p.archived_at IS NULL))";

// Runs with the AI administrator's regular check of an owner. Returns the tip id or null.
export async function offerListingTip(db:D1Database,ownerId:string,t=epoch()):Promise<string|null>{
 await q(db,expireSql+' AND owner_id=?',t,t,ownerId).run();
 // One tip at a time, and a pause of three days after the last one.
 if(await one(db,"SELECT 1 FROM listing_tips WHERE owner_id=? AND (status='suggested' OR created_at>?)",ownerId,t-TIP_PAUSE))return null;
 const flats=await rows(db,'SELECT id,city,rooms FROM properties WHERE owner_id=? AND published=1 AND archived_at IS NULL AND demo_owner IS NULL ORDER BY created_at',ownerId);
 for(const property of flats){
  const [mine]=await statsFor(db,'p.id=?',[property.id],t);if(!mine)continue;
  const answered=await rows(db,"SELECT kind,subject FROM listing_tips WHERE property_id=? AND ((status='declined' AND decided_at>?) OR (status='accepted' AND decided_at>?))",property.id,t-TIP_DECLINE_PAUSE,t-TIP_REPEAT_PAUSE);
  const tip=listingTip(mine,await leadersFor(db,property,mine,t),new Set(answered.map(a=>a.kind+':'+a.subject)));
  if(!tip)continue;
  const versions=await one(db,'SELECT (SELECT version FROM property_details WHERE property_id=?) details,(SELECT version FROM property_policies WHERE property_id=?) policy',property.id,property.id);
  const id=uuid(),words=tipText(tip),body='Совет по объявлению · «'+mine.title+'». '+words.text;
  const r=await db.batch([
   q(db,`INSERT INTO listing_tips(id,property_id,owner_id,kind,subject,mine,theirs,count,leaders,value,details_version,policy_version,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM listing_tips WHERE owner_id=? AND (status='suggested' OR created_at>?))`,
    id,property.id,ownerId,tip.kind,tip.subject,tip.mine,tip.theirs,tip.count,tip.leaders,tip.value,versions?.details??null,versions?.policy??null,t,t+TIP_TTL,ownerId,t-TIP_PAUSE),
   q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM listing_tips WHERE id=?)',uuid(),ownerId,body,'owner:listing:'+id,t,id),
   q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM listing_tips WHERE id=?)',uuid(),'system:listing-quality',property.id,JSON.stringify({action:'listing.tip',tipId:id,kind:tip.kind,subject:tip.subject,mine:tip.mine,theirs:tip.theirs,leaders:tip.leaders,onBehalfOf:ownerId}),t,id)
  ]);
  return r[0].meta.changes?id:null;
 }
 return null;
}

// A tip the owner already followed on their own (added the amenity, set an hourly price) is closed quietly.
function stillTrue(tip:Row){
 let details:Row={};try{details=JSON.parse(tip.details||'{}');}catch{}
 if(tip.kind==='amenity')return !(details.amenities||[]).includes(tip.subject);
 if(tip.kind==='hourly')return !Number(tip.hourly_price);
 if(tip.kind==='checkin')return (details.checkinMethod||'meet')==='meet';
 if(tip.kind==='photos'){let photos:unknown[]=[];try{photos=JSON.parse(tip.photos||'[]');}catch{}return photos.length<tip.theirs;}
 return String(tip.description||'').trim().length<tip.theirs*0.6;
}
const tipCols='l.*,p.title,p.description,d.details,d.photos,d.version current_details,pp.hourly_price,pp.version current_policy FROM listing_tips l JOIN properties p ON p.id=l.property_id LEFT JOIN property_details d ON d.property_id=l.property_id LEFT JOIN property_policies pp ON pp.property_id=l.property_id';

export async function ownerListingTips(db:D1Database,ownerId:string,t=epoch()){
 await q(db,expireSql+' AND owner_id=?',t,t,ownerId).run();
 const list=await rows(db,"SELECT "+tipCols+" WHERE l.owner_id=? AND l.status='suggested' AND l.expires_at>? ORDER BY l.created_at DESC LIMIT 3",ownerId,t);
 const stale=list.filter(l=>!stillTrue(l));
 for(const l of stale)await q(db,"UPDATE listing_tips SET status='expired',decided_at=? WHERE id=? AND status='suggested'",t,l.id).run();
 return list.filter(l=>stillTrue(l)).map(({details,photos,description,...l})=>l);
}

export async function decideListingTip(s:RentalService,tipId:string,accept:boolean){
 const t=epoch(),id=required(tipId,'Совет',100);
 const tip=await one(s.db,"SELECT "+tipCols+" WHERE l.id=? AND l.owner_id=?",id,s.userId);
 if(!tip)throw new DomainError('Совет недоступен.',404);
 if(tip.status!=='suggested'||tip.expires_at<=t||!stillTrue(tip))throw new DomainError('Совет уже неактуален: объявление изменилось.',409);
 const close=(status:string,extra:Row={})=>[
  q(s.db,"UPDATE listing_tips SET status=?,decided_at=? WHERE id=? AND status='suggested'",status,t,id),
  q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),s.userId,tip.property_id,JSON.stringify({action:'listing.'+status,tipId:id,kind:tip.kind,subject:tip.subject,...extra}),t)];
 if(!accept){
  const r=await s.db.batch(close('declined'));
  if(!r[0].meta.changes)throw new DomainError('Совет уже закрыт.',409);
  return {message:'Хорошо, этот совет больше не покажу.'};
 }
 if(tip.kind==='amenity'){
  let details:Row={};try{details=JSON.parse(tip.details||'{}');}catch{}
  const next={...details,amenities:[...new Set([...(details.amenities||[]),tip.subject])]},revision=uuid();
  const r=await s.db.batch([
   q(s.db,'UPDATE property_details SET details=?,version=version+1,revision=?,updated_at=? WHERE property_id=? AND version=? AND EXISTS(SELECT 1 FROM listing_tips WHERE id=? AND status=\'suggested\')',JSON.stringify(next),revision,t,tip.property_id,tip.current_details,id),
   q(s.db,"UPDATE listing_tips SET status='accepted',decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM property_details WHERE property_id=? AND revision=?)",t,id,tip.property_id,revision),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_details WHERE property_id=? AND revision=?)',uuid(),s.userId,tip.property_id,JSON.stringify({action:'listing.accepted',tipId:id,kind:'amenity',amenity:tip.subject}),t,tip.property_id,revision)
  ]);
  if(!r[0].meta.changes)throw new DomainError('Объявление уже изменилось. Обновите экран.',409);
  return {message:'Готово: в «'+tip.title+'» отмечено «'+(amenities[tip.subject]||tip.subject).toLocaleLowerCase('ru')+'».'};
 }
 if(tip.kind==='hourly'){
  const revision=uuid(),r=await s.db.batch([
   q(s.db,"UPDATE property_policies SET hourly_price=?,version=version+1,revision=?,updated_at=? WHERE property_id=? AND hourly_price=0 AND minimum_rate<=? AND EXISTS(SELECT 1 FROM listing_tips WHERE id=? AND status='suggested')",tip.value,revision,t,tip.property_id,tip.value,id),
   q(s.db,"UPDATE listing_tips SET status='accepted',decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)",t,id,tip.property_id,revision),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',uuid(),s.userId,tip.property_id,JSON.stringify({action:'listing.accepted',tipId:id,kind:'hourly',hourly:tip.value,version:tip.current_policy+1}),t,tip.property_id,revision)
  ]);
  if(!r[0].meta.changes)throw new DomainError('Тарифы уже изменились или цена ниже минимальной ставки. Обновите экран.',409);
  return {message:'Готово: «'+tip.title+'» теперь можно снять почасово за '+money(tip.value)+' в час.'};
 }
 // The rest is done in the listing editor: the tip is closed and the right step opens.
 const r=await s.db.batch(close('accepted'));
 if(!r[0].meta.changes)throw new DomainError('Совет уже закрыт.',409);
 return {message:'Открываю «'+tip.title+'».',edit:{propertyId:tip.property_id,step:tipStep(tip.kind)}};
}
