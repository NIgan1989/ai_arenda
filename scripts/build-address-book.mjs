// Builds the address book of Kazakhstan from an OpenStreetMap extract: settlements, their districts, streets and houses.
// Input: GeoJSON lines from `osmium export --add-unique-id=type_id -f geojsonseq` of the filtered extract
// (see .github/workflows/address-book.yml). Output: small JSON files the Worker reads from R2 one at a time:
//   meta.json                 version, date and counts
//   top.json                  the largest settlements, for an empty city field
//   p/<key>.json              settlements whose name has a word starting with <key>
//   d/<place>.json            districts of a settlement
//   s/<place>.json            streets and houses of a small settlement
//   s/<place>/<key>.json      streets of a large settlement with a word starting with <key>, with their houses
// Usage: node scripts/build-address-book.mjs <input.geojsonseq> <output dir> [version]
import {createReadStream,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
async function textTools(){
 const out=join(root,'outputs','address-book-tools');mkdirSync(out,{recursive:true});
 const js=ts.transpileModule(readFileSync(join(root,'lib','address-text.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 writeFileSync(join(out,'address-text.mjs'),js);return import(pathToFileURL(join(out,'address-text.mjs')).href);
}
const {nameTokens,plainName,shardKey,shardFile,houseNumber,shortStreet}=await textTools();

const SETTLEMENTS={city:4,town:3,village:2,hamlet:1};
const DISTRICT_PLACES=new Set(['suburb','quarter','neighbourhood','borough']);
const STREETS=new Set(['residential','living_street','primary','secondary','tertiary','unclassified','pedestrian','primary_link','secondary_link','tertiary_link','road']);
const SINGLE_FILE_LIMIT=120_000;
const round5=n=>Math.round(n*1e5)/1e5;

function centre(geometry){
 const c=geometry?.coordinates;if(!c)return null;
 if(geometry.type==='Point')return c;
 if(geometry.type==='LineString')return c[Math.floor(c.length/2)];
 const ring=geometry.type==='Polygon'?c[0]:geometry.type==='MultiPolygon'?c[0][0]:geometry.type==='MultiLineString'?c[0]:null;
 if(!ring?.length)return null;
 if(geometry.type==='MultiLineString')return ring[Math.floor(ring.length/2)];
 const pts=ring.length>1?ring.slice(0,-1):ring;let x=0,y=0;for(const p of pts){x+=p[0];y+=p[1];}return [x/pts.length,y/pts.length];
}
function rings(geometry){return geometry.type==='Polygon'?geometry.coordinates:geometry.type==='MultiPolygon'?geometry.coordinates.flat():[];}
function bbox(rs){let a=180,b=90,c=-180,d=-90;for(const r of rs)for(const [x,y] of r){if(x<a)a=x;if(y<b)b=y;if(x>c)c=x;if(y>d)d=y;}return [a,b,c,d];}
// Even-odd over all rings, so holes are outside.
function inside(area,[x,y]){
 const [a,b,c,d]=area.box;if(x<a||x>c||y<b||y>d)return false;let hit=false;
 for(const r of area.rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}
 return hit;
}
const metres=([x1,y1],[x2,y2])=>{const k=Math.cos((y1+y2)/2*Math.PI/180);return Math.hypot((x2-x1)*k,y2-y1)*111_320;};
const names=t=>[t['name:ru'],t.name,t['name:kk'],t.official_name,t['official_name:ru'],t.alt_name,t['alt_name:ru'],t.old_name,t['old_name:ru'],t['old_name:kk'],t.short_name].filter(Boolean).flatMap(n=>String(n).split(';')).map(n=>n.trim()).filter(Boolean);
const ruName=t=>String(t['name:ru']||t.name||'').trim();

export async function buildAddressBook(lines,{version=new Date().toISOString().slice(0,10)}={}){
 const places=[],districtPoints=[],admin=[],streets=[],houses=[];
 for await (const raw of lines){
  const line=raw.replace(/^\x1e/,'').trim();if(!line)continue;
  let f;try{f=JSON.parse(line);}catch{continue;}
  const t=f.properties||{},g=f.geometry;if(!g)continue;
  if(SETTLEMENTS[t.place]&&t.name&&g.type==='Point'){places.push({id:String(f.id||t['@id']||'').replace(/^node\/?/,'n'),tags:t,c:g.coordinates});continue;}
  if(t.boundary==='administrative'&&t.name&&['4','6','9','10'].includes(String(t.admin_level))&&/Polygon/.test(g.type)){const rs=rings(g);if(rs.length)admin.push({level:Number(t.admin_level),name:ruName(t),rings:rs,box:bbox(rs),c:centre(g)});continue;}
  if(DISTRICT_PLACES.has(t.place)&&t.name){const c=centre(g);if(c)districtPoints.push({name:ruName(t),all:names(t),c});}
  if(t['addr:housenumber']&&(t['addr:street']||t['addr:place'])){const c=centre(g);if(c)houses.push({street:String(t['addr:street']||t['addr:place']).trim(),number:houseNumber(t['addr:housenumber']),city:t['addr:city']||'',c});}
  if(t.highway&&STREETS.has(t.highway)&&t.name){const c=centre(g);if(c)streets.push({tags:t,c});}
 }
 // Settlements: kind, size, region and district of the country.
 const oblasts=admin.filter(a=>a.level===4),raions=admin.filter(a=>a.level===6);
 const book=places.map(p=>{
  const kind=p.tags.place,pop=Number(String(p.tags.population||'').replace(/\D/g,''))||0,c=[round5(p.c[0]),round5(p.c[1])];
  const radius=kind==='city'?(pop>=900_000?25_000:pop>=250_000?15_000:10_000):kind==='town'?(pop>=50_000?8_000:5_000):kind==='village'?2_500:1_200;
  const region=oblasts.find(a=>inside(a,c))?.name||'',raion=raions.find(a=>inside(a,c))?.name||'';
  const all=[...new Set(names(p.tags))];
  return {id:p.id,name:ruName(p.tags),kk:String(p.tags['name:kk']||'').trim(),all,kind,pop,c,radius,region:region===ruName(p.tags)?'':region,raion,streets:new Map(),districts:[]};
 }).filter(p=>p.id&&p.name);
 // A grid of 0.1° cells, so that each street and house finds its settlement quickly.
 const grid=new Map(),cell=(x,y)=>Math.floor(x*10)+':'+Math.floor(y*10);
 for(const p of book){const r=Math.ceil(p.radius/11_000)+1;for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){const k=cell(p.c[0]+dx/10,p.c[1]+dy/10);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}}
 const byName=new Map();for(const p of book)for(const n of p.all){const k=plainName(n,'place');if(!byName.has(k))byName.set(k,[]);byName.get(k).push(p);}
 const settlementOf=(c,city='')=>{
  if(city){const named=(byName.get(plainName(city,'place'))||[]).filter(p=>metres(p.c,c)<60_000).sort((a,b)=>metres(a.c,c)-metres(b.c,c))[0];if(named)return named;}
  let best=null,score=1;for(const p of grid.get(cell(c[0],c[1]))||[]){const s=metres(p.c,c)/p.radius;if(s<score||s===score&&best&&SETTLEMENTS[p.kind]>SETTLEMENTS[best.kind]){score=s;best=p;}}return best;
 };
 // Districts: city districts by their borders, then named micro-districts and quarters by their centre.
 for(const a of admin.filter(a=>a.level>=9)){const p=a.c&&settlementOf(a.c);if(p&&SETTLEMENTS[p.kind]>=3)p.districts.push({name:a.name,all:[a.name],c:[round5(a.c[0]),round5(a.c[1])],area:a});}
 for(const d of districtPoints){const p=settlementOf(d.c);if(p&&!p.districts.some(x=>plainName(x.name,'place')===plainName(d.name,'place')))p.districts.push({name:d.name,all:[...new Set(d.all)],c:[round5(d.c[0]),round5(d.c[1])]});}
 const districtOf=(p,c)=>{
  if(!p.districts.length)return -1;const area=p.districts.findIndex(d=>d.area&&inside(d.area,c));if(area>=0)return area;
  let best=-1,near=1_500;p.districts.forEach((d,i)=>{if(!d.area){const m=metres(d.c,c);if(m<near){near=m;best=i;}}});return best;
 };
 // Streets: every name of a road leads to one entry of its settlement.
 const entry=(p,n,c,all=[n])=>{
  const keys=[...new Set(all.map(x=>plainName(x)).filter(Boolean))];let e=keys.map(k=>p.streets.get(k)).find(Boolean);
  if(!e){e={name:shortStreet(n),all:new Set(),c,houses:new Map()};}
  for(const x of all)e.all.add(x);for(const k of keys)p.streets.set(k,e);return e;
 };
 for(const s of streets){const p=settlementOf(s.c);if(p)entry(p,ruName(s.tags),s.c,names(s.tags));}
 let placed=0;
 for(const h of houses){const p=settlementOf(h.c,h.city);if(!p||!h.number)continue;const e=entry(p,h.street,h.c,[h.street]);if(!e.houses.has(h.number)){e.houses.set(h.number,{c:h.c,d:districtOf(p,h.c)});placed++;}}
 // Files.
 const files=new Map(),put=(path,value)=>files.set(path,JSON.stringify(value));
 const off=(p,c)=>[Math.round((c[0]-p.c[0])*1e5),Math.round((c[1]-p.c[1])*1e5)];
 const order=(a,b)=>(parseInt(a,10)||0)-(parseInt(b,10)||0)||a.localeCompare(b,'ru');
 let streetCount=0,houseCount=0;
 for(const p of book){
  const unique=[...new Set(p.streets.values())];p.hasStreets=0;p.hasDistricts=p.districts.length?1:0;
  if(p.districts.length)put(`d/${p.id}.json`,p.districts.map(d=>({n:d.name,v:[...new Set(d.all.map(x=>plainName(x,'place')))],c:d.c})));
  if(!unique.length)continue;
  const rows=unique.map(e=>{const all=[...e.all],tokens=[...new Set(all.flatMap(x=>nameTokens(x)))];return {row:{n:e.name,v:[...new Set(all.map(x=>plainName(x)).filter(Boolean))],c:off(p,e.c),h:[...e.houses].sort(([a],[b])=>order(a,b)).map(([n,h])=>h.d>=0?[n,...off(p,h.c),h.d]:[n,...off(p,h.c)])},tokens};}).filter(r=>r.row.v.length);
  streetCount+=rows.length;houseCount+=rows.reduce((n,r)=>n+r.row.h.length,0);
  const whole=JSON.stringify(rows.map(r=>r.row));
  if(whole.length<=SINGLE_FILE_LIMIT){files.set(`s/${p.id}.json`,whole);p.hasStreets=1;continue;}
  const shards=new Map();for(const r of rows)for(const k of new Set(r.tokens.map(shardKey)))(shards.get(k)||shards.set(k,[]).get(k)).push(r.row);
  for(const [k,list] of shards)put(`s/${p.id}/${shardFile(k)}.json`,list);p.hasStreets=2;
 }
 const placeRow=p=>({i:p.id,n:p.name,...(p.kk&&p.kk!==p.name?{k:p.kk}:{}),v:[...new Set(p.all.map(x=>plainName(x,'place')).filter(Boolean))],t:p.kind,...(p.pop?{p:p.pop}:{}),...(p.region?{r:p.region}:{}),...(p.raion?{a:p.raion}:{}),c:p.c,s:p.hasStreets,d:p.hasDistricts});
 const index=new Map();for(const p of book){const row=placeRow(p);for(const k of new Set(p.all.flatMap(n=>nameTokens(n,'place')).map(shardKey)))(index.get(k)||index.set(k,[]).get(k)).push(row);}
 for(const [k,list] of index)put(`p/${shardFile(k)}.json`,list.sort((a,b)=>SETTLEMENTS[b.t]-SETTLEMENTS[a.t]||(b.p||0)-(a.p||0)));
 put('top.json',book.filter(p=>SETTLEMENTS[p.kind]>=3).sort((a,b)=>SETTLEMENTS[b.kind]-SETTLEMENTS[a.kind]||b.pop-a.pop).slice(0,60).map(placeRow));
 const counts={settlements:book.length,streets:streetCount,houses:houseCount,housesRead:houses.length,housesPlaced:placed,districts:book.reduce((n,p)=>n+p.districts.length,0),files:files.size+1,bytes:[...files.values()].reduce((n,v)=>n+Buffer.byteLength(v),0)};
 put('meta.json',{version,built:new Date().toISOString(),source:'© OpenStreetMap contributors, ODbL',counts});
 return {files,counts,book};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [input,out,version]=process.argv.slice(2);if(!input||!out)throw Error('Usage: node scripts/build-address-book.mjs <input.geojsonseq> <output dir> [version]');
 const {files,counts,book}=await buildAddressBook(createInterface({input:createReadStream(input),crlfDelay:Infinity}),{version:version||undefined});
 rmSync(out,{recursive:true,force:true});
 for(const [path,body] of files){mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),body);}
 console.log(JSON.stringify(counts));
 // A short report for the log: the largest cities and how full their books are.
 for(const p of book.filter(p=>p.kind==='city').sort((a,b)=>b.pop-a.pop).slice(0,25)){const s=new Set(p.streets.values());console.log([p.name,p.region,'streets '+s.size,'houses '+[...s].reduce((n,e)=>n+e.houses.size,0),'districts '+p.districts.length].join(' · '));}
}
