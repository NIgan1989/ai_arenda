// GET /api/public/address — suggestions from the address book while the owner types.
//   kind=city&q=…                         settlements (and cities of published listings)
//   kind=district&city=…&place=…&q=…      districts of the settlement
//   kind=street&city=…&place=…&q=…        streets, then houses with their point and district
// Open without signing in (the city is also asked at sign-up). The book is public OpenStreetMap data.
import {suggestPlaces,suggestDistricts,suggestAddress,canonicalCity,type BookBucket} from './address-book';

const text=(v:string|null,max:number)=>String(v||'').replace(/[\u0000-\u001f]/g,' ').slice(0,max);
const placeId=(v:unknown)=>typeof v==='string'&&/^[nwr]\d{1,15}$/.test(v)?v:'';
export async function addressRequest(bucket:BookBucket|undefined,db:D1Database|undefined,params:URLSearchParams){
 const kind=params.get('kind'),q=text(params.get('q'),200),city=text(params.get('city'),80),place=placeId(params.get('place'));
 if(kind==='city')return {items:await suggestPlaces(bucket,db,q)};
 if(kind==='district')return {items:(await suggestDistricts(bucket,db,city,q,place)).map(name=>({name}))};
 if(kind==='street')return {items:await suggestAddress(bucket,city,q,place)};
 return {items:[]};
}
// A listing keeps the city under its right name: «павлодар», «Павладар», «Өскемен» become «Павлодар» and
// «Усть-Каменогорск». A settlement missing from the book stays as the owner wrote it.
export async function withCanonicalCity<T>(bucket:BookBucket|undefined,body:T):Promise<T>{
 if(!body||typeof body!=='object')return body;const b=body as Record<string,unknown>;
 if(typeof b.city!=='string'||!b.city.trim())return body;
 try{const found=await canonicalCity(bucket,b.city,placeId(b.cityId));if(found&&found.name!==b.city)return {...b,city:found.name} as T;}catch{/* the city stays as typed */}
 return body;
}
