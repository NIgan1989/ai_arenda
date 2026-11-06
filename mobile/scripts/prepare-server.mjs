import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = new URL('../server/generated/', import.meta.url);
mkdirSync(target, {recursive:true});
// Native and web clients share the same booking and cleaning rules.
for (const name of readdirSync(new URL('../../lib/',import.meta.url)).filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')).map(f=>f.slice(0,-3))) {
  const source = readFileSync(new URL(`../../lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
    .replace("from './domain'", "from './domain.js'").replace("from './ai'", "from './ai.js'").replace("from './operations'", "from './operations.js'").replace("from './assistant'", "from './assistant.js'").replace("from './access'", "from './access.js'").replace("from './rental-policy'", "from './rental-policy.js'").replace("from './account'", "from './account.js'").replace("from './listings'","from './listings.js'").replace("from './approvals'", "from './approvals.js'").replace(/from '(\.\/[^']+)'/g, (all,name)=>name.endsWith(".js")?all:`from '${name}.js'`);
  writeFileSync(new URL(name+'.js', target), js.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${name.endsWith('.js')?name:name+'.js'}'`));
}
const migrations=readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
writeFileSync(new URL('schema.sql',target),readFileSync(new URL('../../drizzle/'+migrations[0],import.meta.url),'utf8'));
for(const file of migrations.slice(1))writeFileSync(new URL(file,target),readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8'));
writeFileSync(new URL('migrations.json',target),JSON.stringify(migrations.slice(1)));
console.log('Shared server prepared:',fileURLToPath(target));
