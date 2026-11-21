// A test that turns one TypeScript file into JavaScript by itself needs the words of the interface (lib/i18n*.ts)
// next to it: withWords(js, folder) writes them into the folder and points the file's import of i18n at them.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const options={compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}};
export function withWords(js,folder,ext='.mjs'){
 for(const file of readdirSync('lib').filter(name=>/^i18n.*\.ts$/.test(name)))
  writeFileSync(folder+'/'+file.replace(/\.ts$/,ext),ts.transpileModule(readFileSync('lib/'+file,'utf8'),options).outputText.replace(/from '\.\/(i18n[^']*)'/g,`from './$1${ext}'`));
 return js.replace(/from '(?:\.\.?\/)+(?:lib\/)?i18n'/g,`from './i18n${ext}'`);
}
