// Gives every test listing of the live base (ids a10e0000-0000-4000-8001-…, see docs) several real photos of its kind
// instead of the one drawn picture. The photos are openly licensed (list and authors: scripts/demo-photos/photos.json).
// Each listing gets its own copies: a photo row of its owner and its own object in R2, so removing a photo from one
// listing never touches another. Their prints are stored empty, so the repeat of one picture across test listings is
// not taken for stolen photos. Running it again changes nothing: the ids are fixed and the rows are written over.
// Usage: node scripts/demo-photos/seed-demo-photos.mjs   (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID)
//        node scripts/demo-photos/seed-demo-photos.mjs --plan   (no Cloudflare: prints which photos each kind gets)
import {readFileSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {BUCKET_NAME} from '../ensure-r2-bucket.mjs';

const PHOTOS=JSON.parse(readFileSync(new URL('./photos.json',import.meta.url),'utf8')).kinds;
export const PER_PLACE=4;
const TEST=/^a10e0000-0000-4000-8001-0(\d{11})$/;
// The photos of one listing: PER_PLACE of its kind, starting at a place that moves with the listing's number,
// so that two listings of one kind next to each other do not open on the same picture.
export function pick(kind,n){
 const list=PHOTOS[kind]||PHOTOS.apartment;const out=[];
 for(let j=0;j<Math.min(PER_PLACE,list.length);j++)out.push(list[(n+j)%list.length]);
 return out;
}
export const mediaId=(propertyId,j)=>{const m=TEST.exec(propertyId);if(!m)throw Error('not a test listing: '+propertyId);return 'a10e0000-0000-4000-8007-'+m[1]+j;};
const lit=v=>typeof v==='number'?String(v):"'"+String(v).replace(/'/g,"''")+"'";

if(process.argv.includes('--plan')){
 for(const [kind,list] of Object.entries(PHOTOS))console.log(kind,list.length,'photos');
 process.exit(0);
}
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,database=process.env.CLOUDFLARE_D1_DATABASE_ID;
if(!token||!account||!database){console.log('::error::CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_DATABASE_ID are needed.');process.exit(1);}
const api='https://api.cloudflare.com/client/v4/accounts/'+account,auth={Authorization:'Bearer '+token};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function sql(text){
 for(let i=1;;i++){const r=await fetch(`${api}/d1/database/${database}/query`,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({sql:text})});
  const body=await r.json().catch(()=>null);if(r.ok&&body?.success)return body.result.at(-1).results;
  if(i>=5||(r.status<500&&r.status!==429))throw Error('D1 answered '+r.status+': '+JSON.stringify(body?.errors||'').slice(0,300));await pause(5000*i);}
}
async function put(key,bytes){
 for(let i=1;;i++){const r=await fetch(`${api}/r2/buckets/${BUCKET_NAME}/objects/${key.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',headers:{...auth,'Content-Type':'image/jpeg'},body:bytes});
  if(r.ok)return;const text=(await r.text()).slice(0,200);if(i>=6||(r.status<500&&r.status!==429))throw Error(`R2 refused ${key}: ${r.status} ${text}`);await pause(r.status===429?60000:5000*i);}
}
// Each chosen photo once: fetched, cut to 1280 px on the long side, without its metadata, under the server's size limit.
const dir='outputs/demo-photos';mkdirSync(dir,{recursive:true});
const ready=new Map();
async function prepare(photo){
 if(ready.has(photo.id))return ready.get(photo.id);
 const raw=`${dir}/${photo.id}.src`,out=`${dir}/${photo.id}.jpg`;
 let ok=false;for(let i=1;i<=4&&!ok;i++){try{const r=await fetch(photo.url,{headers:{'user-agent':'ai-arenda-demo-seed'}});if(r.ok){writeFileSync(raw,Buffer.from(await r.arrayBuffer()));ok=true;}else await pause(3000*i);}catch{await pause(3000*i);}}
 if(!ok)throw Error('photo not fetched: '+photo.url);
 for(const q of [80,72,64,56]){execFileSync('convert',[raw+'[0]','-auto-orient','-resize','1280x1280>','-strip','-interlace','JPEG','-quality',String(q),out]);if(statSync(out).size<340000)break;}
 const [w,h]=execFileSync('identify',['-format','%w %h',out]).toString().trim().split(' ').map(Number);
 const value={bytes:readFileSync(out),width:w,height:h};ready.set(photo.id,value);return value;
}
const places=await sql("SELECT p.id,p.owner_id,COALESCE(json_extract(d.details,'$.type'),'apartment') type FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.id LIKE 'a10e0000-0000-4000-8001-%' ORDER BY p.id");
console.log(`${places.length} test listings`);
let n=0;
for(const p of places){
 if(!TEST.test(p.id))continue;
 const chosen=pick(p.type,n++),ids=[],now=Math.floor(Date.now()/1000),rows=[];
 for(const [j,photo] of chosen.entries()){
  const image=await prepare(photo),id=mediaId(p.id,j),key='media/'+id+'.jpg';
  await put(key,image.bytes);ids.push(id);
  rows.push(`INSERT INTO media(id,user_id,kind,data,width,height,bytes,created_at,object_key) VALUES (${[id,p.owner_id,'property','',image.width,image.height,image.bytes.length,now,key].map(lit).join(',')}) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,width=excluded.width,height=excluded.height,bytes=excluded.bytes,object_key=excluded.object_key,data=''`);
  rows.push(`INSERT INTO media_prints(media_id,print,created_at) VALUES (${lit(id)},'',${now}) ON CONFLICT(media_id) DO UPDATE SET print=''`);
 }
 rows.push(`UPDATE property_details SET photos=${lit(JSON.stringify(ids))},version=version+1,revision=${lit(randomUUID())},updated_at=${now} WHERE property_id=${lit(p.id)} AND photos<>${lit(JSON.stringify(ids))}`);
 await sql(rows.join(';\n'));
 console.log(p.id,p.type,ids.length);
}
console.log('done');
