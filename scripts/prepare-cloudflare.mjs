// Generates a deployment configuration only. Does not log in, upload, or deploy.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function cloudflareConfig({root=process.cwd(),databaseId,accountId,workerName='ai-arenda'}={}){
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(databaseId||'')||/^0{8}-/.test(databaseId))throw Error('Provide the real D1 database ID returned by Cloudflare.');
 if(!/^[a-f0-9]{32}$/i.test(accountId||''))throw Error('Provide the Cloudflare account ID.');
 if(!/^[a-z][a-z0-9-]{2,62}$/.test(workerName))throw Error('Use a lowercase Worker name.');
 const built=JSON.parse(readFileSync(resolve(root,'dist/server/wrangler.json'),'utf8'));
 if(!existsSync(resolve(root,'dist/server/index.js'))||!existsSync(resolve(root,'dist/client')))throw Error('Build the application first.');
 return {
  name:workerName,account_id:accountId,main:resolve(root,'dist/server/index.js'),
  compatibility_date:built.compatibility_date||'2026-05-15',compatibility_flags:built.compatibility_flags||['nodejs_compat'],
  no_bundle:true,rules:[{type:'ESModule',globs:['**/*.js','**/*.mjs']}],
  workers_dev:true,preview_urls:false,
  observability:{enabled:true,head_sampling_rate:0.1,logs:{enabled:true,invocation_logs:true},traces:{enabled:true,head_sampling_rate:0.1}},
  assets:{directory:resolve(root,'dist/client'),binding:'ASSETS',run_worker_first:false},
  d1_databases:[{binding:'DB',database_name:'ai-arenda',database_id:databaseId,migrations_dir:resolve(root,'drizzle')}],
  triggers:{crons:['* * * * *']},
  // Runtime secrets are supplied separately; no .dev.vars or live sessions copied.
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
 if(args.length%2||args.some((v,i)=>i%2===0&&!['--database-id','--account-id','--name'].includes(v)))throw Error('Use --database-id UUID --account-id ID [--name ai-arenda].');
 const root=fileURLToPath(new URL('../',import.meta.url));
 const config=cloudflareConfig({root,databaseId:get('--database-id'),accountId:get('--account-id'),workerName:args.includes('--name')?get('--name'):undefined});
 const out=resolve(root,'.sites-runtime/cloudflare');mkdirSync(out,{recursive:true});const path=resolve(out,'wrangler.json');writeFileSync(path,JSON.stringify(config,null,2));
 console.log(JSON.stringify({prepared:true,config:'.sites-runtime/cloudflare/wrangler.json',deployed:false,secretsIncluded:false}));
}
