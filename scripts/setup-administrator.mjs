import './sites-env.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

mkdirSync('.sites-runtime/migrations',{recursive:true});
const config=resolve('.sites-runtime/migrations/wrangler.json');
writeFileSync(config,JSON.stringify({name:'arenda-local-migrations',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
const args=['node_modules/wrangler/bin/wrangler.js','d1','execute','site-creator-d1','--config',config,'--local','--persist-to',resolve('.wrangler/state')];
const check=spawnSync(process.execPath,[...args,'--command',"SELECT name FROM sqlite_master WHERE name='administrator_tasks'",'--json'],{encoding:'utf8'});
if(check.status!==0){console.error('Could not inspect the local database.');process.exit(1);}
const result=JSON.parse(check.stdout);
if(result.some(item=>item.results?.some(row=>row.name==='administrator_tasks'))){console.log('AI administrator migration is already applied.');process.exit(0);}
// Wrangler executes this SQL on the same persisted D1 database as the local app.
const migration=spawnSync(process.execPath,[...args,'--file',resolve('drizzle/0008_ai_administrator.sql')],{stdio:'inherit'});
if(migration.error)throw migration.error;
process.exitCode=migration.status??1;
