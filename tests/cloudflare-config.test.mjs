import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import {cloudflareConfig} from '../scripts/prepare-cloudflare.mjs';

test('cloud deployment preparation rejects placeholder destinations and cannot copy local secrets',()=>{
 const root=mkdtempSync(resolve('outputs/cloud-config-test-'));mkdirSync(resolve(root,'dist/server'),{recursive:true});mkdirSync(resolve(root,'dist/client'),{recursive:true});
 writeFileSync(resolve(root,'dist/server/index.js'),'export default {};');
 writeFileSync(resolve(root,'dist/server/wrangler.json'),JSON.stringify({vars:{SHOULD_NOT_LEAK:'private-fixture'},services:[{binding:'CONNECTORS'}],compatibility_date:'2026-05-15'}));
 const input={root,databaseId:'12345678-1234-4234-8234-123456789abc',accountId:'a'.repeat(32)};
 assert.throws(()=>cloudflareConfig({...input,databaseId:'00000000-0000-4000-8000-000000000000'}),/real D1/);
 assert.throws(()=>cloudflareConfig({...input,accountId:''}),/account ID/);
 const config=cloudflareConfig(input);assert.equal(config.workers_dev,true);assert.deepEqual(config.triggers.crons,['* * * * *']);assert.equal(config.d1_databases[0].binding,'DB');assert.equal(config.assets.run_worker_first,false);assert.equal('vars' in config,false);assert.equal('services' in config,false);assert.equal(JSON.stringify(config).includes('private-fixture'),false);
});

test('automatic publishing keeps stored Worker secrets and never reads local ones',async()=>{
 const {readFileSync}=await import('node:fs');const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/wrangler\.js deploy [^\n]*--keep-vars/);
 assert.doesNotMatch(workflow,/\.dev\.vars|--secrets-file|reset-local-data|deploy-cloudflare\.mjs/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/workflow_run\.conclusion == 'success'/);
});

test('automatic publishing needs only the API token and finds the account and database itself',async()=>{
 const {readFileSync}=await import('node:fs');const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 const gate=workflow.slice(workflow.indexOf('Check that publishing is configured'),workflow.indexOf('actions/checkout'));
 assert.match(gate,/CLOUDFLARE_API_TOKEN/);assert.doesNotMatch(gate,/ACCOUNT_ID|DATABASE_ID/);
 assert.ok(workflow.indexOf('resolve-cloudflare-ids.mjs')<workflow.indexOf('prepare-cloudflare.mjs'));
 const {pickAccount,pickDatabase}=await import('../scripts/resolve-cloudflare-ids.mjs');
 const account='a'.repeat(32),other='b'.repeat(32),database='11111111-2222-3333-4444-555555555555';
 assert.equal(pickAccount([{id:account}]),account);
 assert.equal(pickAccount([{id:account},{id:other}],other),other);
 assert.throws(()=>pickAccount([]),/any Cloudflare account/);
 assert.throws(()=>pickAccount([{id:account},{id:other}]),/several accounts/);
 assert.throws(()=>pickAccount([],'not-an-id'),/not a Cloudflare account ID/);
 assert.equal(pickDatabase([{name:'other',uuid:database},{name:'ai-arenda',uuid:database}]),database);
 assert.throws(()=>pickDatabase([{name:'ai-arenda-test',uuid:database}]),/was not found/);
 assert.equal(pickDatabase([],'ai-arenda',database),database);
});

test('the photo bucket is bound only when publishing confirmed it exists',async()=>{
 const root=mkdtempSync(resolve('outputs/cloud-config-test-'));mkdirSync(resolve(root,'dist/server'),{recursive:true});mkdirSync(resolve(root,'dist/client'),{recursive:true});
 writeFileSync(resolve(root,'dist/server/index.js'),'export default {};');writeFileSync(resolve(root,'dist/server/wrangler.json'),'{}');
 const input={root,databaseId:'12345678-1234-4234-8234-123456789abc',accountId:'a'.repeat(32)};
 assert.equal('r2_buckets' in cloudflareConfig(input),false);
 assert.deepEqual(cloudflareConfig({...input,bucket:'ai-arenda-media'}).r2_buckets,[{binding:'BUCKET',bucket_name:'ai-arenda-media'}]);
 assert.throws(()=>cloudflareConfig({...input,bucket:'Bad Name'}),/bucket/);
 const {ensureBucket,explain}=await import('../scripts/ensure-r2-bucket.mjs');
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
 assert.deepEqual(await ensureBucket({token:'t',account:'a',fetcher:async()=>reply({success:true})}),{ready:true,created:false});
 let calls=[];assert.deepEqual(await ensureBucket({token:'t',account:'a',fetcher:async(url,init={})=>{calls.push(init.method||'GET');return calls.length===1?reply({success:false,errors:[{code:10006}]},404):reply({success:true});}}),{ready:true,created:true});assert.deepEqual(calls,['GET','POST']);
 // R2 switched off and no bucket on the published Worker: publish without storage, photos stay in D1.
 const disabled=async url=>url.endsWith('/settings')?reply({success:true,result:{bindings:[{type:'d1',name:'DB'}]}}):reply({success:false,errors:[{code:10042,message:'Please enable R2'}]},403);
 const off=await ensureBucket({token:'t',account:'a',fetcher:disabled});assert.equal(off.ready,false);assert.match(off.reason,/enable it/);
 // Indeterminate replies stop the publish instead of dropping the binding.
 await assert.rejects(ensureBucket({token:'t',account:'a',fetcher:async()=>reply({success:false,errors:[]},503)}),/did not answer/);
 await assert.rejects(ensureBucket({token:'t',account:'a',fetcher:async()=>new Response('<html>',{status:502})}),/unreadable/);
 await assert.rejects(ensureBucket({token:'t',account:'a',fetcher:async(url,init={})=>init.method==='POST'?reply({success:false,errors:[]},500):reply({success:false,errors:[{code:10006}]},404)}),/did not create/);
 // A permission error while the Worker already uses R2 also stops it: photos may live there.
 await assert.rejects(ensureBucket({token:'t',account:'a',fetcher:async url=>url.endsWith('/settings')?reply({success:true,result:{bindings:[{type:'r2_bucket',name:'BUCKET'}]}}):reply({success:false,errors:[{code:10000}]},403)}),/already stores photos/);
 assert.match(explain([{code:10000}]),/R2 permission/);
 const workflow=(await import('node:fs')).readFileSync('.github/workflows/deploy.yml','utf8');assert.ok(workflow.indexOf('ensure-r2-bucket.mjs')<workflow.indexOf('prepare-cloudflare.mjs'));assert.match(workflow,/MEDIA_BUCKET:\+--bucket/);
});

test('publishing connects the Telegram bot from one GitHub secret without printing it',async()=>{
 const {setupTelegram,webhookSecret}=await import('../scripts/setup-telegram.mjs');
 const calls=[],fetcher=async(url,init)=>{const body=JSON.parse(init.body||'{}');calls.push({url,body});
  if(url.endsWith('/getMe'))return Response.json({ok:true,result:{username:'ai_arenda_bot'}});
  if(url.includes('api.telegram.org'))return Response.json({ok:true,result:true});
  if(url.endsWith('/secrets')&&!init.method)return Response.json({success:true,result:[{name:'TELEGRAM_BOT_TOKEN'}]});
  return Response.json({success:true});};
 const r=await setupTelegram({token:'123:secret',account:'acc',cfToken:'cf',site:'https://ai-arenda.example.dev',fetcher});
 assert.deepEqual(r,{username:'ai_arenda_bot',url:'https://ai-arenda.example.dev/api/hooks/telegram'});
 const saved=Object.fromEntries(calls.filter(c=>c.url.includes('/secrets')&&c.body.name).map(c=>[c.body.name,c.body.text]));
 assert.deepEqual(saved,{TELEGRAM_BOT_TOKEN:'123:secret',TELEGRAM_BOT_USERNAME:'ai_arenda_bot',TELEGRAM_WEBHOOK_SECRET:webhookSecret('123:secret'),SITE_PUBLIC_URL:'https://ai-arenda.example.dev'});
 assert.deepEqual(calls.find(c=>c.url.endsWith('/setWebhook')).body.allowed_updates,['message','callback_query']);
 const hook=calls.find(c=>c.url.endsWith('/setWebhook')).body;assert.equal(hook.secret_token,webhookSecret('123:secret'));assert.match(hook.secret_token,/^[a-f0-9]{48}$/);
 await assert.rejects(setupTelegram({token:'bad',account:'acc',cfToken:'cf',site:'https://x.dev',fetcher:async()=>Response.json({ok:false,description:'Unauthorized'})}),/getMe failed/);
 const workflow=(await import('node:fs')).readFileSync('.github/workflows/deploy.yml','utf8');assert.ok(workflow.indexOf('Publish the Worker')<workflow.indexOf('setup-telegram.mjs'));assert.match(workflow,/TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/);
});
