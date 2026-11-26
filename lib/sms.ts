// One door for every SMS the service sends: the codes that confirm a phone number (lib/participant-security.ts) and the
// password reset codes (lib/native-auth.ts). The provider is not chosen yet (2026-11-26): the service speaks one plain
// contract, POST {id,to,text,category} with «Authorization: Bearer» to SMS_GATEWAY_URL, and the chosen provider is
// put behind it, either as that provider's own adapter here or as a small proxy that speaks the contract.
// Until SMS_GATEWAY_URL and SMS_GATEWAY_TOKEN are set nothing is sent and the app says that SMS comes later.
export type SmsConfig={SMS_GATEWAY_URL?:string;SMS_GATEWAY_TOKEN?:string};
export const smsReady=(config:SmsConfig)=>!!(config.SMS_GATEWAY_TOKEN&&config.SMS_GATEWAY_URL&&/^https:\/\//.test(config.SMS_GATEWAY_URL));
/** Sends one SMS; true when the provider accepted it. `id` makes a retry of the same message harmless. */
export async function sendSms(config:SmsConfig,message:{id:string;to:string;text:string;category?:'verification'|'notice'}){
 if(!smsReady(config))return false;
 try{
  const r=await fetch(config.SMS_GATEWAY_URL!,{method:'POST',headers:{Authorization:'Bearer '+config.SMS_GATEWAY_TOKEN,'Content-Type':'application/json','Idempotency-Key':message.id},body:JSON.stringify({id:message.id,to:message.to,text:message.text,category:message.category||'verification'}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  return r.ok;
 }catch{return false;}
}
