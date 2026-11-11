// Finds the Cloudflare account and the D1 database for automatic publishing, so that the API token is the only secret GitHub needs.
// Reads only. Never prints the identifiers: in GitHub Actions they are masked and passed to the next steps through GITHUB_ENV.
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ACCOUNT=/^[a-f0-9]{32}$/i,DATABASE=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function pickAccount(accounts,wanted=''){
 if(wanted){if(!ACCOUNT.test(wanted))throw Error('CLOUDFLARE_ACCOUNT_ID is not a Cloudflare account ID.');return wanted;}
 const ids=(accounts||[]).map(a=>a?.id).filter(id=>ACCOUNT.test(id||''));
 if(!ids.length)throw Error('The API token does not give access to any Cloudflare account.');
 if(ids.length>1)throw Error('The API token gives access to several accounts. Add CLOUDFLARE_ACCOUNT_ID to the repository secrets.');
 return ids[0];
}
export function pickDatabase(databases,name='ai-arenda',wanted=''){
 if(wanted){if(!DATABASE.test(wanted))throw Error('CLOUDFLARE_D1_DATABASE_ID is not a D1 database ID.');return wanted;}
 const found=(databases||[]).filter(d=>d?.name===name&&DATABASE.test(d?.uuid||''));
 if(found.length!==1)throw Error(`D1 database ${name} was not found with this API token. Check that the token has the D1 Edit permission.`);
 return found[0].uuid;
}
async function api(path,token){
 const response=await fetch(`https://api.cloudflare.com/client/v4${path}`,{headers:{authorization:`Bearer ${token}`}});
 const body=await response.json().catch(()=>null);
 if(!response.ok||!body?.success)throw Error(`Cloudflare API ${path.split('?')[0].replace(/[a-f0-9]{32}/i,':account')} answered ${response.status}: ${(body?.errors||[]).map(e=>e.message).join('; ')||'no details'}`);
 return body.result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.CLOUDFLARE_API_TOKEN||'';if(!token)throw Error('CLOUDFLARE_API_TOKEN is not set.');
 const wantedAccount=process.env.CLOUDFLARE_ACCOUNT_ID||'',wantedDatabase=process.env.CLOUDFLARE_D1_DATABASE_ID||'';
 const account=pickAccount(wantedAccount?[]:await api('/accounts?per_page=50',token),wantedAccount);
 const database=pickDatabase(wantedDatabase?[]:await api(`/accounts/${account}/d1/database?name=ai-arenda&per_page=100`,token),'ai-arenda',wantedDatabase);
 if(process.env.GITHUB_ENV){
  console.log(`::add-mask::${account}`);console.log(`::add-mask::${database}`);
  appendFileSync(process.env.GITHUB_ENV,`CLOUDFLARE_ACCOUNT_ID=${account}\nCLOUDFLARE_D1_DATABASE_ID=${database}\n`);
 }
 console.log(JSON.stringify({resolved:true,account:wantedAccount?'given':'found',database:wantedDatabase?'given':'found'}));
}
