import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
for(const args of [['mobile/scripts/prepare-server.mjs'],['--test',...readdirSync('mobile/tests').filter(f=>f.endsWith('.test.mjs')).map(f=>'mobile/tests/'+f)]]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
