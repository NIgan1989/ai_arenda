// Saves the Cloudflare Realtime keys as Worker secrets after publishing, so calls inside the app work. The owner only
// adds two GitHub secrets: REALTIME_APP_ID and REALTIME_APP_TOKEN. The token stays on the server; the app never sees it.
// Without the secrets the step does nothing and the call button keeps the old behaviour. Values are never printed.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function saveRealtimeKeys({appId,token,account,cfToken,worker='ai-arenda',fetcher=fetch}){
 if(!/^[a-f0-9]{32}$/i.test(appId))throw new Error('The REALTIME_APP_ID secret does not look like a Realtime App ID');
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(token))throw new Error('The REALTIME_APP_TOKEN secret does not look like a Realtime API token');
 for(const [name,text] of [['REALTIME_APP_ID',appId],['REALTIME_APP_TOKEN',token]]){
  const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,{method:'PUT',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify({name,text,type:'secret_text'})});
  const v=await r.json().catch(()=>({}));if(!v.success)throw new Error('Cloudflare did not save '+name+' ('+r.status+')');
 }
 return {saved:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const appId=(process.env.REALTIME_APP_ID||'').trim(),token=(process.env.REALTIME_APP_TOKEN||'').trim();
 if(!appId||!token){console.log('::notice::Calls inside the app are off: add the REALTIME_APP_ID and REALTIME_APP_TOKEN repository secrets.');process.exit(0);}
 console.log('::add-mask::'+token);
 try{await saveRealtimeKeys({appId,token,account:process.env.CLOUDFLARE_ACCOUNT_ID,cfToken:process.env.CLOUDFLARE_API_TOKEN});console.log('Realtime keys are saved for the Worker.');}
 catch(error){console.log('::error::Saving the Realtime keys failed: '+String(error?.message||error).replaceAll(token,'***'));process.exit(1);}
}
