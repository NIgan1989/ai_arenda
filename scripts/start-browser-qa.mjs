import './prepare-map-assets.mjs';
import './sites-env.mjs';
import {prepareQaWorkflows} from './prepare-qa-workflows.mjs';
console.log('QA workflows:',JSON.stringify(await prepareQaWorkflows()));
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const settings=new URL('../outputs/browser-qa/ai-settings.json',import.meta.url);let liveAI=false;
try{liveAI=JSON.parse(readFileSync(settings,'utf8')).enabled===true;}catch{}
if(process.argv.includes('--live-ai')){liveAI=true;mkdirSync(new URL('../outputs/browser-qa/',import.meta.url),{recursive:true});writeFileSync(settings,JSON.stringify({enabled:true}));}
// A separate hostname prevents QA authentication from replacing 127.0.0.1 user cookies.
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/vinext/dist/cli.js',import.meta.url)),'dev','--port','5174'],{stdio:'inherit',env:{...process.env,ARENDA_BROWSER_QA:'1',ARENDA_QA_LIVE_AI:liveAI?'1':'0',VINEXT_NO_DEV_LOCK:'1'}});
const coordinator=spawn(process.execPath,[fileURLToPath(new URL('./qa-administrator-loop.mjs',import.meta.url))],{stdio:'inherit',env:process.env});
const stop=()=>{child.kill();coordinator.kill();};process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('exit',stop);
coordinator.once('error',()=>console.error('QA administrator: background process could not start.'));
child.once('exit',code=>{coordinator.kill();process.exitCode=code??1;});
