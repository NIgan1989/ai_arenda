// Keep Wrangler OAuth state and logs in ignored project-local directories.
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const config=fileURLToPath(new URL('../.sites-runtime/cloudflare-auth/',import.meta.url));
mkdirSync(config,{recursive:true});
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),...process.argv.slice(2)],{
 cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',
 env:{...process.env,XDG_CONFIG_HOME:config,WRANGLER_LOG_PATH:fileURLToPath(new URL('../.wrangler/logs/',import.meta.url)),WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false'},
});
child.once('error',()=>{console.error('Could not start Wrangler.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
