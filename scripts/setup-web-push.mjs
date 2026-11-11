import {readFileSync,appendFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {generateVAPIDKeys} from 'web-push';
const path='.dev.vars',env=parseEnv(readFileSync(path,'utf8'));
const supplied=[env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY,env.VAPID_SUBJECT].filter(Boolean).length;
if(supplied&&supplied!==3)throw Error('Incomplete VAPID configuration. Preserve the existing key pair and complete the settings manually.');
if(supplied===3)console.log('Push keys already configured; preserved.');
else{
 const url=new URL(process.env.ARENDA_PUBLIC_URL||env.SITE_PUBLIC_URL||'');
 if(url.protocol!=='https:'||url.hostname==='localhost')throw Error('Set ARENDA_PUBLIC_URL to the real HTTPS service origin.');
 const keys=generateVAPIDKeys();appendFileSync(path,'\n# Browser push signing keys: server only, preserve between deployments.\nVAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey+'\nVAPID_SUBJECT='+url.origin+'\n',{mode:0o600});console.log('Push keys saved privately. No values logged.');
}
