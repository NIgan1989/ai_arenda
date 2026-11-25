// The files that tie the phone app to the server's domain, so that iPhone and Android let the app use the passkeys made
// for that domain (sign-in with Face ID or a fingerprint, lib/passkeys.ts). Apple and Google fetch them from
// /.well-known/ themselves; they must answer JSON directly, without a redirect.
export const APP_ID='app.aiarenda.assistant';
// The Android test app is signed with the public debug key of the React Native template (.github/workflows/android.yml).
// The store build gets its own key: put its fingerprint in ANDROID_CERT_SHA256 (several are separated by commas).
export const DEBUG_CERT_SHA256='FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C';
export type AppLinksConfig={APPLE_TEAM_ID?:string;ANDROID_CERT_SHA256?:string};

export function androidCertificates(config:AppLinksConfig={}){
 return (config.ANDROID_CERT_SHA256||DEBUG_CERT_SHA256).split(',').map(v=>v.trim().toUpperCase()).filter(v=>/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v));
}
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});

// APPLE_TEAM_ID is the ten-character team of the Apple developer account; the publish workflow saves it for the Worker
// from the repository secret the TestFlight build already uses (scripts/setup-apple-team.mjs).
export function appLinksResponse(request:Request,config:AppLinksConfig={}){
 if(request.method!=='GET'&&request.method!=='HEAD')return null;
 const path=new URL(request.url).pathname;
 if(path==='/.well-known/apple-app-site-association'){
  const team=(config.APPLE_TEAM_ID||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{10}$/.test(team))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  return json({webcredentials:{apps:[team+'.'+APP_ID]}});
 }
 if(path==='/.well-known/assetlinks.json')return json([{relation:['delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:APP_ID,sha256_cert_fingerprints:androidCertificates(config)}}]);
 return null;
}
