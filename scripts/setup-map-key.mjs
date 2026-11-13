// Saves the Stadia Maps key as a Worker secret after publishing, so the owner only adds one GitHub secret:
// STADIA_API_KEY. The key stays on the server: the app asks our API for routes and never sees it.
// Without the secret the step does nothing and routes keep using the public test router. Values are never printed.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function saveMapKey({key,account,cfToken,worker='ai-arenda',fetcher=fetch}){
 if(!/^[A-Za-z0-9-]{8,128}$/.test(key))throw new Error('The STADIA_API_KEY secret does not look like a Stadia Maps key');
 const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,{method:'PUT',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify({name:'STADIA_API_KEY',text:key,type:'secret_text'})});
 const v=await r.json().catch(()=>({}));if(!v.success)throw new Error('Cloudflare did not save STADIA_API_KEY ('+r.status+')');
 return {saved:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const key=(process.env.STADIA_API_KEY||'').trim();
 if(!key){console.log('::notice::Map routes use the public test router: add the STADIA_API_KEY repository secret to switch to Stadia Maps.');process.exit(0);}
 console.log('::add-mask::'+key);
 try{await saveMapKey({key,account:process.env.CLOUDFLARE_ACCOUNT_ID,cfToken:process.env.CLOUDFLARE_API_TOKEN});console.log('Stadia Maps key is saved for the Worker.');}
 catch(error){console.log('::error::Saving the map key failed: '+String(error?.message||error).replaceAll(key,'***'));process.exit(1);}
}
