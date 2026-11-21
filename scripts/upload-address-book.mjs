// Puts a built address book into the photo bucket (R2) and then points geo/kz/current.json at it, so the Worker
// switches to the new book only once every file is there. Two places take turns: geo/kz/a/ and geo/kz/b/. The new
// book goes to the one the Worker is not reading, and the older files there are simply written over (no deletes).
// The Cloudflare API allows about 1 200 requests in 5 minutes, so files go at a steady pace: ~9 000 files take ~40 min.
// Usage: node scripts/upload-address-book.mjs <dir>   (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID)
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {BUCKET_NAME} from './ensure-r2-bucket.mjs';

export const PREFIX='geo/kz/';
const walk=dir=>readdirSync(dir).flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function uploadAddressBook({dir,token,account,bucket=BUCKET_NAME,fetcher=fetch,log=console.log,perSecond=3.8,wait=pause}){
 const meta=JSON.parse(readFileSync(join(dir,'meta.json'),'utf8'));
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/`,auth={Authorization:'Bearer '+token};
 const url=k=>base+k.split('/').map(encodeURIComponent).join('/');
 // One request at a time slot: the API answers 429 when asked faster, and then we wait a minute and go on.
 let next=0;const turn=async()=>{const now=Date.now(),at=Math.max(now,next);next=at+1000/perSecond;if(at>now)await wait(at-now);};
 const send=async(k,body)=>{for(let i=1;;i++){await turn();let r;try{r=await fetcher(url(k),{method:'PUT',headers:{...auth,'Content-Type':'application/json','Cache-Control':'public, max-age=86400'},body});}catch(e){if(i>=8)throw e;await wait(5000*i);continue;}
  if(r.ok)return;const text=(await r.text()).slice(0,200);if(i>=8||r.status<500&&r.status!==429)throw Error(`R2 refused ${k}: ${r.status} ${text}`);await wait(r.status===429?60_000:5000*i);}};
 // Which place the Worker reads now. Only a confirmed «no such file» starts a first book; any other doubt stops the
 // upload, so the book in use is never written over.
 let live='';
 for(let i=1;;i++){await turn();let r;try{r=await fetcher(url(PREFIX+'current.json'),{headers:auth});}catch(e){if(i>=5)throw Error('The current address book could not be read: '+(e?.message||e));await wait(5000*i);continue;}
  if(r.status===404){live='';break;}
  if(r.ok){let body;try{body=await r.json();}catch{body=null;}const v=String(body?.version||'');if(v!=='a'&&v!=='b'&&!/^[\w.-]{1,40}$/.test(v))throw Error('The current address book pointer is unreadable.');live=v;break;}
  if(i>=5||r.status<500&&r.status!==429)throw Error('The current address book could not be read ('+r.status+').');await wait(r.status===429?60_000:5000*i);}
 const slot=live==='a'?'b':'a',files=walk(dir).map(p=>relative(dir,p).split(sep).join('/'));let done=0;
 log(`Uploading ${files.length} files into ${PREFIX}${slot}/ (the Worker reads ${live||'nothing'} meanwhile).`);
 const queue=[...files];await Promise.all(Array.from({length:6},async()=>{for(let f;(f=queue.shift());){await send(PREFIX+slot+'/'+f,readFileSync(join(dir,f)));if(++done%1000===0)log(`${done} of ${files.length} files`);}}));
 await send(PREFIX+'current.json',JSON.stringify({version:slot,build:meta.version,built:meta.built,counts:meta.counts,pk:meta.pk}));
 log(`Address book ${meta.version}: ${files.length} files uploaded to ${slot} and switched on.`);
 return {slot,files:files.length};
}
if(process.argv[1]&&process.argv[1].endsWith('upload-address-book.mjs')){
 const dir=process.argv[2],token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!dir||!token||!account){console.log('::error::Usage: node scripts/upload-address-book.mjs <dir> with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');process.exit(1);}
 await uploadAddressBook({dir,token,account});
}
