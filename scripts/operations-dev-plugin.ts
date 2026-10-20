import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import type {Plugin} from 'vite';
export function localOperationsToken(){
 mkdirSync('.sites-runtime',{recursive:true});
 try{return readFileSync('.sites-runtime/operations-token','utf8').trim();}catch{const token=randomBytes(32).toString('hex');writeFileSync('.sites-runtime/operations-token',token,{mode:0o600});return token;}
}
export function operationsDev(token:string):Plugin{
 return {name:'arenda-background-operations',apply:'serve',configureServer(server){
  let running=false;
  const tick=async()=>{if(running)return;const address=server.httpServer?.address();if(!address||typeof address==='string')return;running=true;try{const response=await fetch(`http://127.0.0.1:${address.port}/api/system/tick`,{method:'POST',headers:{'x-operations-token':token}});if(!response.ok)server.config.logger.warn('Ассистент: не удалось выполнить фоновую проверку.');}catch{server.config.logger.warn('Ассистент: сервер недоступен для фоновой проверки.');}finally{running=false;}};
  const timer=setInterval(tick,30000);timer.unref();server.httpServer?.once('close',()=>clearInterval(timer));
 }};
}
