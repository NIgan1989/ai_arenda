// Puts a built address book into the photo bucket (R2) under geo/kz/<version>/, then points geo/kz/current.json at it,
// so the Worker switches to the new book only once every file is there. Older versions are removed afterwards.
// Usage: node scripts/upload-address-book.mjs <dir>   (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID)
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
import {BUCKET_NAME} from './ensure-r2-bucket.mjs';

export const PREFIX='geo/kz/';
const walk=dir=>readdirSync(dir).flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
export async function uploadAddressBook({dir,token,account,bucket=BUCKET_NAME,fetcher=fetch,log=console.log}){
 const meta=JSON.parse(readFileSync(join(dir,'meta.json'),'utf8')),version=String(meta.version||'');
 if(!/^[\w.-]{1,40}$/.test(version))throw Error('meta.json has no usable version.');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/`,auth={Authorization:'Bearer '+token};
 const key=k=>base+k.split('/').map(encodeURIComponent).join('/');
 const send=async(k,body,tries=5)=>{for(let i=1;;i++){try{const r=await fetcher(key(k),{method:'PUT',headers:{...auth,'Content-Type':'application/json','Cache-Control':'public, max-age=86400'},body});if(r.ok)return;if(i>=tries||r.status<500&&r.status!==429)throw Error(`R2 refused ${k}: ${r.status} ${(await r.text()).slice(0,200)}`);}catch(e){if(i>=tries)throw e;}await new Promise(r=>setTimeout(r,500*2**i));}};
 const files=walk(dir).map(p=>relative(dir,p).split(sep).join('/'));let done=0;
 const queue=[...files];await Promise.all(Array.from({length:24},async()=>{for(let f;(f=queue.shift());){await send(PREFIX+version+'/'+f,readFileSync(join(dir,f)));if(++done%2000===0)log(`${done} of ${files.length} files`);}}));
 await send(PREFIX+'current.json',JSON.stringify({version,built:meta.built,counts:meta.counts}));
 log(`Address book ${version}: ${files.length} files uploaded and switched on.`);
 // Old versions: list them and delete, keeping the new one and the one before it.
 const listed=[];let cursor='';
 do{const u=new URL(base.replace(/\/objects\/$/,'/objects'));u.searchParams.set('prefix',PREFIX);u.searchParams.set('delimiter','/');if(cursor)u.searchParams.set('cursor',cursor);const r=await fetcher(u,{headers:auth});const b=await r.json().catch(()=>({}));if(!r.ok||!b.success){log('Old versions were not listed; they stay.');return {version,files:files.length};}listed.push(...(b.result_info?.delimited||b.result?.delimitedPrefixes||[]));cursor=b.result_info?.is_truncated?b.result_info.cursor:'';}while(cursor);
 const old=[...new Set(listed)].map(p=>p.slice(PREFIX.length).replace(/\/$/,'')).filter(v=>v&&v!==version).sort().slice(0,-1);
 for(const v of old){let next='',gone=0;do{const u=new URL(base.replace(/\/objects\/$/,'/objects'));u.searchParams.set('prefix',PREFIX+v+'/');u.searchParams.set('per_page','1000');if(next)u.searchParams.set('cursor',next);const r=await fetcher(u,{headers:auth}),b=await r.json().catch(()=>({}));if(!r.ok||!b.success)break;const keys=(b.result||[]).map(o=>o.key);const q=[...keys];await Promise.all(Array.from({length:24},async()=>{for(let k;(k=q.shift());){await fetcher(key(k),{method:'DELETE',headers:auth}).catch(()=>{});gone++;}}));next=b.result_info?.is_truncated?b.result_info.cursor:'';}while(next);log(`Removed old version ${v}: ${gone} files.`);}
 return {version,files:files.length};
}
if(process.argv[1]&&process.argv[1].endsWith('upload-address-book.mjs')){
 const dir=process.argv[2],token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!dir||!token||!account){console.log('::error::Usage: node scripts/upload-address-book.mjs <dir> with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');process.exit(1);}
 await uploadAddressBook({dir,token,account});
}
