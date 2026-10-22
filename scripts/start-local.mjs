import {createConnection} from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
  console.log('Starting AI Arenda at '+url);
  console.log('Keep this window open while using the application.');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./run-framework.mjs',import.meta.url)),'dev'],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',env:process.env,
  });
  child.once('error',error=>{console.error('Could not start the server: '+error.message);process.exitCode=1;});
  child.once('exit',code=>{process.exitCode=code??1;});
}
