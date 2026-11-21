// Prints a small part of a built address book (Pavlodar and the lists that lead to it) as gzip+base64 lines,
// so that a branch build can be checked where the build artifact cannot be downloaded.
import {readFileSync,existsSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
const dir=process.argv[2],code=k=>Array.from(k).map(c=>c.codePointAt(0).toString(36)).join('-');
const top=JSON.parse(readFileSync(join(dir,'top.json'),'utf8')),pav=top.find(p=>p.n==='Павлодар');
const paths=['meta.json','top.json',...['па','жа','ус','ал','ок'].map(k=>'p/'+code(k)+'.json')];
if(pav){paths.push('d/'+pav.i+'.json');for(const k of ['то','са','ес','ак','ло','1'])paths.push(pav.s===1?'s/'+pav.i+'.json':'s/'+pav.i+'/'+code(k)+'.json');}
const pack={};for(const p of new Set(paths))if(existsSync(join(dir,p)))pack[p]=readFileSync(join(dir,p),'utf8');
const b64=gzipSync(JSON.stringify(pack),{level:9}).toString('base64');
console.log('SAMPLE-BEGIN '+b64.length);for(let i=0;i<b64.length;i+=4000)console.log('SAMPLE '+b64.slice(i,i+4000));console.log('SAMPLE-END');
