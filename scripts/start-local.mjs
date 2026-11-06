import './prepare-map-assets.mjs';
import {createConnection} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';

const url='http://127.0.0.1:5173/';
const running=await new Promise(resolve=>{
  const socket=createConnection({host:'127.0.0.1',port:5173});
  const finish=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(1500,()=>finish(false));
  socket.once('connect',()=>finish(true));
  socket.once('error',()=>finish(false));
});
if(running){
  console.log('A server is already listening at '+url);
  console.log('Open this address or refresh the application tab.');
}else{
  const vars=new URL('../.dev.vars',import.meta.url);
  let source='';try{source=readFileSync(vars,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!parseEnv(source).ADMINISTRATOR_RUNNER_SECRET)writeFileSync(vars,source.trimEnd()+'\nADMINISTRATOR_RUNNER_SECRET='+randomBytes(32).toString('hex')+'\n');
  console.log('Starting AI Arenda at '+url);
  console.log('Keep this window open while using the application.');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./run-framework.mjs',import.meta.url)),'dev'],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',env:process.env,
  });
  const coordinator=spawn(process.execPath,[fileURLToPath(new URL('./administrator-loop.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',env:process.env});
  const stop=()=>{child.kill();coordinator.kill();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('exit',stop);
  coordinator.once('error',()=>console.error('AI administrator: background process could not start.'));
  child.once('error',error=>{console.error('Could not start the server: '+error.message);process.exitCode=1;});
  child.once('exit',code=>{coordinator.kill();process.exitCode=code??1;});
}
