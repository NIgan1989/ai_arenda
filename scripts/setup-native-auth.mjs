import './sites-env.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

// Uses the same local database ID and directory as vite.config.ts.
mkdirSync('.sites-runtime/migrations',{recursive:true});
const config=resolve('.sites-runtime/migrations/wrangler.json');
writeFileSync(config,JSON.stringify({name:'arenda-local-migrations',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','site-creator-d1','--config',config,'--local','--persist-to',resolve('.wrangler/state'),'--file',resolve('drizzle/0007_native_auth.sql')],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
