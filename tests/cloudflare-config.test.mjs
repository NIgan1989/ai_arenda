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
