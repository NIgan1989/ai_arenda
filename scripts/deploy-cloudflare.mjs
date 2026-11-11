// Publish built assets and an explicit allowlist of server secrets without logging values.
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';import {parseEnv} from 'node:util';import {randomUUID} from 'node:crypto';import {spawnSync} from 'node:child_process';
const configPath=process.argv[2]||'.sites-runtime/cloudflare/wrangler.json',config=JSON.parse(readFileSync(configPath,'utf8'));
if(config.name!=='ai-arenda'||!config.account_id||!config.d1_databases?.some(b=>b.binding==='DB'&&!b.database_id.startsWith('00000000-')))throw Error('Prepare and review the real ai-arenda deployment configuration first.');
const env=parseEnv(readFileSync('.dev.vars','utf8')),secrets={};
for(const key of ['OPENAI_API_KEY','OPENAI_MODEL','ACCESS_ENCRYPTION_KEY','ADMINISTRATOR_RUNNER_SECRET','PLATFORM_ADMIN_IDS','ADMIN_LOGIN_EMAIL','ADMIN_LOGIN_PHONE','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])if(env[key])secrets[key]=env[key];
const origin=new URL(process.env.ARENDA_PUBLIC_URL||env.SITE_PUBLIC_URL||'');if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Set ARENDA_PUBLIC_URL to the real public HTTPS origin.');secrets.SITE_PUBLIC_URL=origin.origin;
const directory=resolve('.sites-runtime/cloudflare');mkdirSync(directory,{recursive:true});mkdirSync('outputs',{recursive:true});const path=resolve(directory,'.deploy-'+randomUUID()+'.secrets.json');writeFileSync(path,JSON.stringify(secrets),{mode:0o600});
try{
 const result=spawnSync(process.execPath,['scripts/cloudflare-local.mjs','deploy','--config',configPath,'--secrets-file',path],{encoding:'utf8',env:{...process.env,CI:'true'},timeout:240000,maxBuffer:8*1024*1024});
 const output=(result.stdout||'')+'\n'+(result.stderr||'');writeFileSync('outputs/cloudflare-deploy.log',output,{mode:0o600});
 console.log(JSON.stringify({deployed:result.status===0,exit:result.status,url:output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0],error:result.error?.code}));if(result.status!==0)process.exitCode=1;
}finally{unlinkSync(path);}
