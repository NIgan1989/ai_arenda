// Generates the web and mobile token files from design/tokens.json. Run with --check in tests.
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
export const tokens=JSON.parse(read('design/tokens.json'));
const kebab=s=>s.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
export function webCss(){
 const v=[];
 for(const [k,x] of Object.entries(tokens.color))v.push(`--t-${kebab(k)}:${x.toLowerCase()}`);
 for(const x of tokens.space)v.push(`--t-space-${x}:${x}px`);
 for(const [k,[size,line]] of Object.entries(tokens.font))v.push(`--t-font-${k}:${size}px`,`--t-line-${k}:${line}px`);
 for(const [k,x] of Object.entries(tokens.radius))v.push(`--t-radius-${k}:${x}px`);
 for(const [k,x] of Object.entries(tokens.control))v.push(`--t-control-${k}:${x}px`);
 for(const [k,x] of Object.entries(tokens.motion))v.push(`--t-motion-${k}:${x}ms`);
 return `/* GENERATED from design/tokens.json by scripts/build-design-tokens.mjs. Do not edit. */\n:root{${v.join(';')}}\n`;
}
export function mobileTs(){
 return `// GENERATED from design/tokens.json by scripts/build-design-tokens.mjs. Do not edit.\nexport const T=${JSON.stringify(tokens)} as const;\n`;
}
const targets=[['app/tokens.css',webCss()],['mobile/src/tokens.ts',mobileTs()]];
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())){
 if(process.argv.includes('--check')){for(const [p,text] of targets)if(read(p)!==text){console.error(p+' is stale. Run node scripts/build-design-tokens.mjs');process.exit(1);}}
 else for(const [p,text] of targets)writeFileSync(new URL(p,root),text);
}
