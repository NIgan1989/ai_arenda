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
export async function ensureBucket({token,account,name=BUCKET_NAME,fetcher=fetch}){
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const read=async r=>{try{return await r.json();}catch{return {success:false,errors:[]};}};
 const found=await read(await fetcher(`${base}/${name}`,{headers}));
 if(found.success)return {ready:true,created:false};
 const made=await read(await fetcher(base,{method:'POST',headers,body:JSON.stringify({name})}));
 if(made.success)return {ready:true,created:true};
 return {ready:false,reason:explain([...(made.errors||[]),...(found.errors||[])])};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 let result;
 // An unreachable API stops the publish instead of dropping the binding: photos already in R2
 // would otherwise become unreadable until the next publish.
 try{result=token&&account?await ensureBucket({token,account}):{ready:false,reason:'Cloudflare account is not known yet.'};}catch(error){console.log('::error::Cloudflare could not be reached to check the photo bucket: '+(error?.message||error));process.exit(1);}
 if(result.ready){console.log(result.created?'Photo bucket created.':'Photo bucket is ready.');if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,`MEDIA_BUCKET=${BUCKET_NAME}\n`);}
 else console.log('::notice::Photos stay in the database for now. '+result.reason);
}
