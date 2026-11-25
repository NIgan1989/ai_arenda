// Saves the Apple team ID for the Worker after publishing, so /.well-known/apple-app-site-association can name the iPhone
// app and the app may use passkeys of this domain (sign-in with Face ID, lib/app-links.ts). The value comes from the
// APPLE_TEAM_ID repository secret the TestFlight build already uses, so the owner adds nothing. Without it the step does
// nothing and the iPhone app keeps signing in by password.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function saveAppleTeam({team,account,cfToken,worker='ai-arenda',fetcher=fetch}){
 const value=String(team||'').trim().toUpperCase();
 if(!/^[A-Z0-9]{10}$/.test(value))throw new Error('The APPLE_TEAM_ID secret does not look like an Apple team ID (ten letters and digits)');
 const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,{method:'PUT',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify({name:'APPLE_TEAM_ID',text:value,type:'secret_text'})});
 const v=await r.json().catch(()=>({}));if(!v.success)throw new Error('Cloudflare did not save APPLE_TEAM_ID ('+r.status+')');
 return {saved:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const team=(process.env.APPLE_TEAM_ID||'').trim();
 if(!team){console.log('::notice::Sign-in with Face ID on iPhone waits for the APPLE_TEAM_ID repository secret (docs/TESTFLIGHT.md).');process.exit(0);}
 try{await saveAppleTeam({team,account:process.env.CLOUDFLARE_ACCOUNT_ID,cfToken:process.env.CLOUDFLARE_API_TOKEN});console.log('Apple team ID is saved for the Worker.');}
 catch(error){console.log('::error::Saving the Apple team ID failed: '+String(error?.message||error));process.exit(1);}
}
