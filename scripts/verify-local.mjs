import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const commands=[
 ['scripts/schema-snapshot.mjs','--check'],
 ['node_modules/typescript/bin/tsc','--noEmit'],
 ['--test',...readdirSync(new URL('../tests',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name)],
 ['scripts/test-api.mjs'],
 ['scripts/run-framework.mjs','build'],
];
for(const args of commands){
 console.log('Verify: node '+args.join(' '));const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false'}});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
console.log('All schema, type, business, HTTP and build checks passed. No deployment performed.');
