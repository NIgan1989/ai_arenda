import {readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import {setTimeout as delay} from 'node:timers/promises';
const stop=new AbortController();process.on('SIGINT',()=>stop.abort());process.on('SIGTERM',()=>stop.abort());let failed=false;
while(!stop.signal.aborted){try{
 const {ADMINISTRATOR_RUNNER_SECRET:secret}=parseEnv(readFileSync(new URL('../.dev.vars',import.meta.url),'utf8'));if(!secret||secret.length<32)throw Error('Runner not configured');
 const r=await fetch('http://localhost:5174/api/internal/administrator-run',{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.any([stop.signal,AbortSignal.timeout(55000)])});if(!r.ok||(await r.json()).failures)throw Error('Checks incomplete');
 if(failed)console.log('QA administrator: background checks resumed.');failed=false;
 }catch{if(!failed&&!stop.signal.aborted)console.log('QA administrator: waiting for server; checks will retry.');failed=true;}
 try{await delay(30000,undefined,{signal:stop.signal});}catch{}
}
