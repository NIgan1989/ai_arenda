import {existsSync,readFileSync} from 'node:fs';import {parseEnv} from 'node:util';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
export async function healthcheck({baseUrl,secret,fetcher=fetch}={}){
 let url;try{url=new URL(baseUrl);}catch{throw Error('Set HEALTHCHECK_BASE_URL or pass --url');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.protocol!=='https:'&&!(local&&url.protocol==='http:')||url.search||url.hash)throw Error('Healthcheck requires HTTPS, except for a local development address');
 if(!secret||secret.length<32)throw Error('ADMINISTRATOR_RUNNER_SECRET is missing or too short');
 const response=await fetcher(new URL('/api/internal/health',url),{headers:{Authorization:'Bearer '+secret,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 let body;try{body=await response.json();}catch{return {ok:false,httpStatus:response.status,status:'invalid_health_response'};}
 // Only fixed aggregate fields are allowed in the command output, even if an
 // unexpected reverse proxy returns an arbitrary JSON error or sensitive payload.
 if(!body||typeof body!=='object'||typeof body.ok!=='boolean')return {ok:false,httpStatus:response.status,status:'invalid_health_response'};
 return {ok:response.ok&&body.ok,httpStatus:response.status,status:['healthy','needs_attention','database_not_ready'].includes(body.status)?body.status:'unexpected_health_status',serverTime:Number.isInteger(body.serverTime)?body.serverTime:null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=fileURLToPath(new URL('../.dev.vars',import.meta.url));let local={};try{if(existsSync(file))local=parseEnv(readFileSync(file,'utf8'));}catch{console.error('Local configuration could not be read.');process.exit(1);}
 const config={...local,...process.env},index=process.argv.indexOf('--url');try{const result=await healthcheck({baseUrl:index>=0?process.argv[index+1]:config.HEALTHCHECK_BASE_URL||'http://127.0.0.1:5173',secret:config.ADMINISTRATOR_RUNNER_SECRET});console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;}catch{console.error('Healthcheck failed: inspect URL, server secret and server availability.');process.exitCode=1;}
}
