// The address book of Kazakhstan: settlements, districts, streets and houses from OpenStreetMap, built once a month by
// scripts/build-address-book.mjs and kept in R2 under geo/kz/. The owner types a city, a street, a house and gets
// suggestions; a typed city is saved under its right name; a house from the book is a ready pin on the map.
// Without the book (no bucket, not built yet) every function answers «nothing found» and the old ways keep working.
import {nameTokens,plainName,shardKey,shardFile,splitAddress,joinAddress,houseNumber,nameFit} from './address-text';
export {splitAddress,joinAddress} from './address-text';

export type BookBucket={get(key:string):Promise<{text():Promise<string>}|null>};
export type BookPlace={i:string;n:string;k?:string;v:string[];t:string;p?:number;r?:string;a?:string;c:[number,number];s:number;d:number};
type BookStreet={n:string;v:string[];c:[number,number];h:(string|number)[][]};
type BookDistrict={n:string;v:string[];c:[number,number]};
export type Place={id:string;name:string;kk?:string;region?:string;raion?:string;kind:string;center:[number,number];streets:boolean;custom?:boolean};
export type AddressItem={kind:'street'|'house';label:string;value:string;street:string;house?:string;point:[number,number];district?:string;houses?:number};

const PREFIX='geo/kz/',RANK:Record<string,number>={city:4,town:3,village:2,hamlet:1};
// A Worker keeps the files it has read for a while: the same street is typed letter by letter.
const memory=new Map<string,{until:number;value:unknown}>();
async function readJson<T>(bucket:BookBucket|undefined,key:string,ttl:number):Promise<T|null>{
 if(!bucket?.get)return null;const now=Date.now(),hit=memory.get(key);if(hit&&hit.until>now){memory.delete(key);memory.set(key,hit);return hit.value as T;}
 let value:T|null=null;try{const o=await bucket.get(key);value=o?JSON.parse(await o.text()) as T:null;}catch{value=null;}
 memory.set(key,{until:now+(value?ttl:60_000),value});while(memory.size>80)memory.delete(memory.keys().next().value as string);return value;
}
async function version(bucket?:BookBucket){const c=await readJson<{version?:string}>(bucket,PREFIX+'current.json',10*60_000);return c?.version&&/^[\w.-]{1,40}$/.test(c.version)?c.version:'';}
async function bookFile<T>(bucket:BookBucket|undefined,path:string){const v=await version(bucket);return v?readJson<T>(bucket,PREFIX+v+'/'+path,60*60_000):null;}
export async function hasAddressBook(bucket?:BookBucket){return !!await version(bucket);}

const place=(p:BookPlace):Place=>({id:p.i,name:p.n,...(p.k?{kk:p.k}:{}),...(p.r?{region:p.r}:{}),...(p.a?{raion:p.a}:{}),kind:p.t,center:p.c,streets:p.s>0});
async function placesFor(bucket:BookBucket|undefined,tokens:string[]){
 const keys=[...new Set(tokens.filter(t=>t.length>=2||/^\d/.test(t)).map(shardKey))].slice(0,2),seen=new Map<string,BookPlace>();
 for(const k of keys)for(const p of await bookFile<BookPlace[]>(bucket,'p/'+shardFile(k)+'.json')||[])seen.set(p.i,p);
 return [...seen.values()];
}
const fitOf=(query:string[],p:{v:string[]})=>Math.max(0,...p.v.map(v=>nameFit(query,v.split(' '))));

// Settlements for what the owner typed, best first: the same name, then names that start so, then with one typo.
// Cities already used by published listings come too, so a village missing from the map is found after its first owner.
export async function suggestPlaces(bucket:BookBucket|undefined,db:D1Database|undefined,text:unknown,limit=8):Promise<Place[]>{
 const query=nameTokens(String(text??'').slice(0,80),'place');
 if(!query.length){const top=await bookFile<BookPlace[]>(bucket,'top.json')||[];return top.slice(0,limit).map(place);}
 const scored=(await placesFor(bucket,query)).map(p=>({p,fit:fitOf(query,p)})).filter(x=>x.fit>0)
  .sort((a,b)=>b.fit-a.fit||(RANK[b.p.t]||0)-(RANK[a.p.t]||0)||(b.p.p||0)-(a.p.p||0)||a.p.n.localeCompare(b.p.n,'ru'));
 const out=scored.slice(0,limit).map(x=>place(x.p)),known=new Set(out.map(p=>plainName(p.name,'place')));
 for(const name of await usedCities(db))if(out.length<limit&&!known.has(plainName(name,'place'))&&nameFit(query,nameTokens(name,'place'))>=2){known.add(plainName(name,'place'));out.push({id:'',name,kind:'custom',center:[0,0],streets:false,custom:true});}
 return out;
}
async function usedCities(db?:D1Database){
 if(!db)return [];try{const r=await db.prepare('SELECT city FROM properties WHERE published=1 GROUP BY city ORDER BY COUNT(*) DESC LIMIT 300').all<{city:string}>();return (r.results||[]).map(x=>String(x.city||'').trim()).filter(Boolean);}catch{return [];}
}
// The settlement a saved city means. Only a whole name counts (or the same name with one typo, for a town),
// so «Пав» stays «Пав» until the owner picks from the list. The id the list gave wins between namesakes.
export async function findPlace(bucket:BookBucket|undefined,text:unknown,id=''):Promise<BookPlace|null>{
 const query=nameTokens(String(text??'').slice(0,80),'place');if(!query.length)return null;
 const list=(await placesFor(bucket,query)).map(p=>({p,fit:fitOf(query,p)})).filter(x=>x.fit===3||x.fit===1&&RANK[x.p.t]>=3);
 const chosen=id&&list.find(x=>x.p.i===id);if(chosen)return chosen.p;
 list.sort((a,b)=>b.fit-a.fit||(RANK[b.p.t]||0)-(RANK[a.p.t]||0)||(b.p.p||0)-(a.p.p||0));return list[0]?.p||null;
}
export async function canonicalCity(bucket:BookBucket|undefined,text:unknown,id=''){const p=await findPlace(bucket,text,id);return p?{name:p.n,place:place(p)}:null;}

async function districtsOf(bucket:BookBucket|undefined,p:BookPlace){return p.d?await bookFile<BookDistrict[]>(bucket,'d/'+p.i+'.json')||[]:[];}
export async function suggestDistricts(bucket:BookBucket|undefined,db:D1Database|undefined,city:unknown,text:unknown,id='',limit=8){
 const p=await findPlace(bucket,city,id),query=nameTokens(String(text??'').slice(0,80),'place'),names=new Map<string,string>();
 for(const d of p?await districtsOf(bucket,p):[])names.set(plainName(d.n,'place'),d.n);
 if(db&&String(city||'').trim())try{const r=await db.prepare('SELECT district FROM properties WHERE published=1 AND lower(city)=lower(?) GROUP BY district ORDER BY COUNT(*) DESC LIMIT 100').bind(p?.n||String(city).trim()).all<{district:string}>();for(const x of r.results||[]){const n=String(x.district||'').trim();if(n&&!names.has(plainName(n,'place')))names.set(plainName(n,'place'),n);}}catch{/* the book alone is enough */}
 const all=[...names.values()];if(!query.length)return all.slice(0,limit);
 return all.map(n=>({n,fit:nameFit(query,nameTokens(n,'place'))})).filter(x=>x.fit>0).sort((a,b)=>b.fit-a.fit||a.n.localeCompare(b.n,'ru')).slice(0,limit).map(x=>x.n);
}

async function streetsFor(bucket:BookBucket|undefined,p:BookPlace,tokens:string[]){
 if(!p.s)return [];if(p.s===1)return await bookFile<BookStreet[]>(bucket,'s/'+p.i+'.json')||[];
 const key=tokens.find(t=>t.length>=2||/^\d/.test(t));return key?await bookFile<BookStreet[]>(bucket,'s/'+p.i+'/'+shardFile(shardKey(key))+'.json')||[]:[];
}
const at=(p:BookPlace,dx:unknown,dy:unknown):[number,number]=>[Number((p.c[0]+Number(dx)/1e5).toFixed(6)),Number((p.c[1]+Number(dy)/1e5).toFixed(6))];
const houseOrder=(a:string,b:string)=>(parseInt(a,10)||0)-(parseInt(b,10)||0)||a.localeCompare(b,'ru');

// Streets and houses of a settlement for what the owner typed: «Торайг» gives streets, «Торайгырова 6» the houses
// 6, 60, 64… of the best street. A house carries its point and district, so the pin and the district fill themselves.
export async function suggestAddress(bucket:BookBucket|undefined,city:unknown,text:unknown,id='',limit=8):Promise<AddressItem[]>{
 const p=await findPlace(bucket,city,id);if(!p||!p.s)return [];
 const parts=splitAddress(String(text??'').slice(0,200)),query=nameTokens(parts.street);if(!query.length)return [];
 const found=(await streetsFor(bucket,p,query)).map(s=>({s,fit:fitOf(query,s)})).filter(x=>x.fit>0)
  .sort((a,b)=>b.fit-a.fit||b.s.h.length-a.s.h.length||a.s.n.localeCompare(b.s.n,'ru'));
 if(!found.length)return [];
 const districts=found.some(x=>x.s.h.some(h=>h.length>3))?await districtsOf(bucket,p):[];
 const house=(s:BookStreet,h:(string|number)[]):AddressItem=>({kind:'house',label:joinAddress(s.n,String(h[0])),value:joinAddress(s.n,String(h[0])),street:s.n,house:String(h[0]),point:at(p,h[1],h[2]),...(h.length>3&&districts[Number(h[3])]?{district:districts[Number(h[3])].n}:{})});
 const street=(s:BookStreet):AddressItem=>({kind:'street',label:s.n,value:s.n+', ',street:s.n,point:at(p,s.c[0],s.c[1]),houses:s.h.length});
 if(parts.house){
  // Houses of the street that fits best (or of every street with the same fit, when the name is shared).
  const best=found.filter(x=>x.fit===found[0].fit).slice(0,3),want=houseNumber(parts.house),out:AddressItem[]=[];
  for(const {s} of best){const same=s.h.filter(h=>String(h[0])===want),start=s.h.filter(h=>String(h[0])!==want&&String(h[0]).startsWith(want)).sort((a,b)=>houseOrder(String(a[0]),String(b[0])));for(const h of [...same,...start])out.push(house(s,h));}
  if(out.length)return out.slice(0,limit).map(x=>parts.flat?{...x,value:joinAddress(x.street,x.house,parts.flat)}:x);
  return best.map(({s})=>({...street(s),value:joinAddress(s.n,parts.house,parts.flat)})).slice(0,limit);
 }
 return found.slice(0,limit).map(x=>street(x.s));
}
// The point of an address when the book knows the house: «found» means the very house, otherwise the street (or the
// settlement) gives a place to start from and the owner moves the pin himself.
export async function bookSpot(bucket:BookBucket|undefined,city:unknown,address:unknown,id=''){
 const p=await findPlace(bucket,city,id);if(!p)return null;
 const parts=splitAddress(address),query=nameTokens(parts.street),centre={longitude:p.c[0],latitude:p.c[1],found:false,exact:false};
 if(!query.length||!p.s)return centre;
 const found=(await streetsFor(bucket,p,query)).map(s=>({s,fit:fitOf(query,s)})).filter(x=>x.fit>=2).sort((a,b)=>b.fit-a.fit||b.s.h.length-a.s.h.length);
 const s=found[0]?.s;if(!s)return centre;
 const h=parts.house&&s.h.find(x=>String(x[0])===houseNumber(parts.house));
 if(h){const [lon,lat]=at(p,h[1],h[2]);return {longitude:lon,latitude:lat,found:true,exact:true};}
 const [lon,lat]=at(p,s.c[0],s.c[1]);return {longitude:lon,latitude:lat,found:false,exact:false};
}
