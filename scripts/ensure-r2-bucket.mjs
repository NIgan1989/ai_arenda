// Makes sure the photo bucket exists before publishing. Never fails the publish: without the
// bucket the Worker is published without the BUCKET binding and keeps photos in D1 as before.
// On success it passes MEDIA_BUCKET to the next steps through GITHUB_ENV.
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const BUCKET_NAME='ai-arenda-media';
export function explain(errors=[]){
 const codes=errors.map(e=>Number(e.code));
 if(codes.includes(10042))return 'R2 is not enabled on this Cloudflare account. Open R2 Object Storage in the Cloudflare dashboard once and enable it (the free plan is enough).';
 if(codes.includes(10000)||codes.includes(9109))return 'The CLOUDFLARE_API_TOKEN secret has no R2 permission. Add Account → Workers R2 Storage: Edit to the token.';
 return 'Cloudflare did not confirm the photo bucket'+(errors[0]?.message?': '+errors[0].message:'.');
}
// Only two answers mean "no storage": R2 is not enabled on the account, or the token may not use
// it. Anything else (5xx, rate limit, malformed reply) is indeterminate and throws, so the publish
// stops instead of dropping the binding. Even a permission error throws when the published Worker
// already has the bucket: photos may already live there.
const definitive=errors=>errors.some(e=>[10042,10000,9109].includes(Number(e.code)));
export async function ensureBucket({token,account,name=BUCKET_NAME,worker='ai-arenda',fetcher=fetch}){
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const read=async r=>{let body;try{body=await r.json();}catch{throw new Error('Cloudflare returned an unreadable reply ('+r.status+')');}return {...body,status:r.status};};
 const found=await read(await fetcher(`${base}/r2/buckets/${name}`,{headers}));
 if(found.success)return {ready:true,created:false};
 const missing=found.status===404||(found.errors||[]).some(e=>Number(e.code)===10006);
 if(!missing&&!definitive(found.errors||[]))throw new Error('Cloudflare did not answer about the photo bucket ('+found.status+')');
 if(missing){const made=await read(await fetcher(`${base}/r2/buckets`,{method:'POST',headers,body:JSON.stringify({name})}));if(made.success)return {ready:true,created:true};if(!definitive(made.errors||[]))throw new Error('Cloudflare did not create the photo bucket ('+made.status+')');found.errors=made.errors;}
 const settings=await read(await fetcher(`${base}/workers/scripts/${worker}/settings`,{headers}));
 if(!settings.success&&settings.status!==404)throw new Error('Cloudflare did not show the published Worker ('+settings.status+')');
 if((settings.result?.bindings||[]).some(b=>b.type==='r2_bucket'))throw new Error('The published Worker already stores photos in R2, but the bucket cannot be confirmed now. '+explain(found.errors||[]));
 return {ready:false,reason:explain(found.errors||[])};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 let result;
 // An unreachable API stops the publish instead of dropping the binding: photos already in R2
 // would otherwise become unreadable until the next publish.
 try{result=token&&account?await ensureBucket({token,account}):{ready:false,reason:'Cloudflare account is not known yet.'};}catch(error){console.log('::error::Photo storage could not be confirmed, publishing stopped: '+(error?.message||error));process.exit(1);}
 if(result.ready){console.log(result.created?'Photo bucket created.':'Photo bucket is ready.');if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,`MEDIA_BUCKET=${BUCKET_NAME}\n`);}
 else console.log('::notice::Photos stay in the database for now. '+result.reason);
}
