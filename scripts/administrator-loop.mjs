import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createLocalBackup} from './local-backup.mjs';

// The child is tied to start-local's lifetime. Closing a browser does not stop checks.
const stop=new AbortController();
process.on('SIGINT',()=>stop.abort());process.on('SIGTERM',()=>stop.abort());
let failed=false;
while(!stop.signal.aborted){
 try{
  const {ADMINISTRATOR_RUNNER_SECRET:secret}=parseEnv(readFileSync(new URL('../.dev.vars',import.meta.url),'utf8'));
  if(!secret||secret.length<32)throw new Error('Runner is not configured');
  const response=await fetch('http://127.0.0.1:5173/api/internal/administrator-run',{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.any([stop.signal,AbortSignal.timeout(55000)])});
  if(!response.ok)throw new Error('Workflow check failed');
  const result=await response.json();if(result.failures)throw new Error('Some workspaces were not checked');
  if(failed)console.log('AI administrator: background checks resumed.');
  if(result.actions)console.log('AI administrator: completed '+result.actions+' authorised actions.');
  try{const snapshot=await createLocalBackup();if(snapshot.lastBackupAt)await fetch('http://127.0.0.1:5173/api/internal/backup-status',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({completedAt:snapshot.lastBackupAt}),signal:AbortSignal.timeout(5000)});}catch{console.log('AI administrator: local backup needs attention.');}
  failed=false;
 }catch{if(!failed&&!stop.signal.aborted)console.log('AI administrator: waiting for the server; checks will retry.');failed=true;}
 try{await delay(30000,undefined,{signal:stop.signal});}catch{}
}
