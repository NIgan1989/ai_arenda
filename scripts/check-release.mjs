import {existsSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function checkRelease({root=process.cwd(),env={},mode='local'}={}){
 if(!['local','production'].includes(mode))throw Error('Mode must be local or production');
 const missing=[],warnings=[],checks={};
 function required(name,valid){checks[name]=!!valid;if(!valid)missing.push(name);}
 let manifest;try{manifest=JSON.parse(readFileSync(resolve(root,'.openai/hosting.json'),'utf8'));}catch{missing.push('hosting_manifest');}
 checks.databaseBinding=manifest?.d1==='DB';if(!checks.databaseBinding)missing.push('DB_binding');
 required('ADMINISTRATOR_RUNNER_SECRET',typeof env.ADMINISTRATOR_RUNNER_SECRET==='string'&&env.ADMINISTRATOR_RUNNER_SECRET.length>=32);
 required('ACCESS_ENCRYPTION_KEY',typeof env.ACCESS_ENCRYPTION_KEY==='string'&&env.ACCESS_ENCRYPTION_KEY.length>=32);
 required('PLATFORM_ADMIN_IDS',typeof env.PLATFORM_ADMIN_IDS==='string'&&env.PLATFORM_ADMIN_IDS.split(',').some(v=>v.trim()));
 const modelPair=!!env.OPENAI_API_KEY===!!env.OPENAI_MODEL;required('OPENAI_configuration_pair',modelPair);
 if(!env.OPENAI_API_KEY)warnings.push('OpenAI_disabled_scenario_available');
 if(mode==='production'){
  let publicUrl=false;try{const url=new URL(env.SITE_PUBLIC_URL);publicUrl=url.protocol==='https:'&&!url.username&&!url.password&&!/^(localhost|127\.|10\.|192\.168\.|\[)/i.test(url.hostname);}catch{}
  required('SITE_PUBLIC_URL',publicUrl);required('built_worker',existsSync(resolve(root,'dist/server/wrangler.json')));required('build_client',existsSync(resolve(root,'dist/client')));
  let worker;try{worker=JSON.parse(readFileSync(resolve(root,'dist/server/wrangler.json'),'utf8'));}catch{}
  required('scheduled_trigger',Array.isArray(worker?.triggers?.crons)&&worker.triggers.crons.length>0);
  // This is explicit operator attestation, not something local code can establish.
  required('BACKUP_RECOVERY_VERIFIED',env.BACKUP_RECOVERY_VERIFIED==='yes');
  warnings.push('Hosted_secrets_and_bindings_must_be_configured_at_destination','Off_machine_backup_and_photo_object_copy_must_be_operational');
 }
 const anyPrice=env.AI_PRICE_MODEL||env.AI_INPUT_USD_PER_MILLION||env.AI_OUTPUT_USD_PER_MILLION;
 if(anyPrice){const input=Number(env.AI_INPUT_USD_PER_MILLION),output=Number(env.AI_OUTPUT_USD_PER_MILLION);required('AI_pricing_configuration',env.AI_PRICE_MODEL===env.OPENAI_MODEL&&Number.isFinite(input)&&input>0&&Number.isFinite(output)&&output>0);}
 if(env.AI_GLOBAL_DAILY_USD_CAP&&!anyPrice)missing.push('AI_pricing_configuration');
 for(const [provider,names] of [['telegram',['TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME','TELEGRAM_WEBHOOK_SECRET']],['sms',['SMS_GATEWAY_URL','SMS_GATEWAY_TOKEN']],['whatsapp',['WHATSAPP_GATEWAY_URL','WHATSAPP_GATEWAY_TOKEN']],['payment',['PAYMENT_GATEWAY_URL','PAYMENT_GATEWAY_TOKEN','PAYMENT_WEBHOOK_SECRET']]]){
  const configured=names.filter(name=>!!env[name]);checks[provider]=configured.length===names.length;if(configured.length&&configured.length!==names.length)missing.push(...names.filter(name=>!env[name]));if(!configured.length)warnings.push(provider+'_not_connected');
 }
 return {ok:missing.length===0,mode,checks,missing:[...new Set(missing)],warnings,notice:'Configuration inspection only; no deployment, connection or secret value is printed. A passing result does not prove hosted availability or a completed recovery drill.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('../',import.meta.url)),file=resolve(root,'.dev.vars');let local={};try{if(existsSync(file))local=parseEnv(readFileSync(file,'utf8'));}catch{console.error('Local configuration could not be read.');process.exit(1);}
 const result=checkRelease({root,env:{...local,...process.env},mode:process.argv.includes('--production')?'production':'local'});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
