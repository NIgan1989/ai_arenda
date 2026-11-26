// Temporary: prints each chosen photo small (base64 JPEG) so a local stand can show them before the merge.
import {readFileSync,writeFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
const kinds=JSON.parse(readFileSync('scripts/demo-photos/photos.json','utf8')).kinds,seen=new Set();
for(const list of Object.values(kinds))for(const p of list){if(seen.has(p.id))continue;seen.add(p.id);
 const r=await fetch(p.url,{headers:{'user-agent':'ai-arenda-demo-photos/1.0 (https://github.com/NIgan1989/ai_arenda)'},signal:AbortSignal.timeout(30000)});if(!r.ok){console.log('FAIL',p.id,r.status);continue;}
 writeFileSync('/tmp/p.src',Buffer.from(await r.arrayBuffer()));execFileSync('convert',['/tmp/p.src[0]','-auto-orient','-resize','900x900>','-strip','-quality','62','/tmp/p.jpg']);
 console.log('PHOTO '+p.id+' '+readFileSync('/tmp/p.jpg').toString('base64'));await new Promise(r=>setTimeout(r,800));}
