// Lines of the app that have no Kazakh or English translation yet (lib/i18n.ts).
// node scripts/i18n-missing.mjs [files…]   (without files: the whole app, mobile/App.tsx and mobile/src)
// Reads the Russian keys from t('…'), tParts('…') and the string values inside L({…}); prints the missing ones as
// JSON lines, ready to be translated into lib/i18n/*.ts. Exits with 1 when something is missing, so a check can use it.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=path.resolve(import.meta.dirname,'..');
const CYR=/[А-Яа-яЁё]/;
// The tables as they are written (lib/i18n-*.ts): every quoted key of an object literal there is a translated line.
function tableKeys(){
  const keys=new Map();
  for(const f of fs.readdirSync(path.join(root,'lib')).filter(f=>/^i18n-.+\.ts$/.test(f))){
    const file=path.join(root,'lib',f),sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    (function walk(n){if(ts.isPropertyAssignment(n)&&ts.isStringLiteral(n.name)&&ts.isArrayLiteralExpression(n.initializer))keys.set(n.name.text,n.initializer.elements.map(e=>e.text));n.forEachChild(walk);})(sf);
  }
  return keys;
}
const WORDS=Object.fromEntries(tableKeys());
function appFiles(){
  const dir=path.join(root,'mobile/src');
  return [path.join(root,'mobile/App.tsx'),...fs.readdirSync(dir).filter(f=>/\.tsx?$/.test(f)).map(f=>path.join(dir,f))];
}
export function keysOf(file){
  const src=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const keys=new Set();
  const strings=n=>{if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&CYR.test(n.text))keys.add(n.text);n.forEachChild(strings);};
  (function walk(n){
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)){
      const name=n.expression.text,first=n.arguments[0];
      if(['t','tr','tParts'].includes(name)&&first){
        // t(a?'…':'…') and t('…') alike
        strings(first);
      }
      if(name==='L'&&first)strings(first);
    }
    n.forEachChild(walk);
  })(sf);
  return keys;
}
const files=process.argv.slice(2).length?process.argv.slice(2).map(f=>path.resolve(f)):appFiles();
const missing=new Map();
for(const f of files)for(const k of keysOf(f))if(!WORDS[k]&&!missing.has(k))missing.set(k,path.relative(root,f));
for(const [k,f] of missing)console.log(JSON.stringify(k)+'\t'+f);
if(missing.size){console.error(missing.size+' lines without translation');process.exitCode=1;}
