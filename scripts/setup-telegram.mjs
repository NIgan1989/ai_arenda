// Connects the Telegram bot after publishing, so the owner only adds one GitHub secret:
// TELEGRAM_BOT_TOKEN. The bot name comes from Telegram, the webhook secret is derived from the
// token, both are stored as Worker secrets, and Telegram is told where to send messages.
// Without the secret the step does nothing. Values are never printed.
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const webhookSecret=token=>createHash('sha256').update('ai-arenda-telegram-webhook:'+token).digest('hex').slice(0,48);
export async function setupTelegram({token,account,cfToken,site,worker='ai-arenda',fetcher=fetch}){
 const tg=async(method,body)=>{const r=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const v=await r.json().catch(()=>({}));if(!v.ok)throw new Error('Telegram '+method+' failed: '+(v.description||r.status));return v.result;};
 const me=await tg('getMe');if(!/^[A-Za-z0-9_]{5,32}$/.test(me?.username||''))throw new Error('Telegram returned no bot name');
 const secret=webhookSecret(token);
 for(const [name,text] of [['TELEGRAM_BOT_TOKEN',token],['TELEGRAM_BOT_USERNAME',me.username],['TELEGRAM_WEBHOOK_SECRET',secret]]){
  const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,{method:'PUT',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify({name,text,type:'secret_text'})});
  const v=await r.json().catch(()=>({}));if(!v.success)throw new Error('Cloudflare did not save '+name+' ('+r.status+')');
 }
 // Buttons in the bot's messages open the site; the Worker learns its public address once, if nobody set it.
 try{
  const list=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,{headers:{Authorization:'Bearer '+cfToken}}).then(r=>r.json()).catch(()=>({}));
  if(list.success&&Array.isArray(list.result)&&!list.result.some(x=>x?.name==='SITE_PUBLIC_URL')){
   const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,{method:'PUT',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify({name:'SITE_PUBLIC_URL',text:new URL(site).origin,type:'secret_text'})});
   const v=await r.json().catch(()=>({}));if(!v.success)console.log('::notice::The site address was not saved for the bot buttons ('+r.status+').');
  }
 }catch{console.log('::notice::The site address was not saved for the bot buttons.');}
 const url=new URL('/api/hooks/telegram',site).href;
 await tg('setWebhook',{url,secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
 await tg('setMyCommands',{commands:[{command:'start',description:'Подключить уведомления'}]}).catch(()=>{});
 return {username:me.username,url};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token){console.log('::notice::Telegram is not set up: add the TELEGRAM_BOT_TOKEN repository secret to turn on notifications in Telegram.');process.exit(0);}
 console.log('::add-mask::'+token);console.log('::add-mask::'+webhookSecret(token));
 try{const r=await setupTelegram({token,account:process.env.CLOUDFLARE_ACCOUNT_ID,cfToken:process.env.CLOUDFLARE_API_TOKEN,site:process.env.ARENDA_PUBLIC_URL});console.log('Telegram bot @'+r.username+' is connected.');}
 catch(error){console.log('::error::Telegram setup failed: '+String(error?.message||error).replaceAll(token,'***'));process.exit(1);}
}
