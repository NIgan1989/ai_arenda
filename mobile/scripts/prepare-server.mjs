import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = new URL('../server/generated/', import.meta.url);
mkdirSync(target, {recursive:true});
// Native and web clients share the same booking and cleaning rules.
for (const name of ['service','domain']) {
  const source = readFileSync(new URL(`../../lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
    .replace("from './domain'", "from './domain.js'").replace("from './ai'", "from './ai.js'");
  writeFileSync(new URL(name+'.js', target), js);
}
// Native pilot deliberately has no external language-model connection.
writeFileSync(new URL('ai.js',target), 'export async function generateAnswer(config,text,role,history,fallback){ return {text:fallback}; }\n');
const schema=readFileSync(new URL('../../drizzle/0000_boring_unus.sql', import.meta.url), 'utf8');
writeFileSync(new URL('schema.sql',target),schema);
console.log('Shared server prepared:',fileURLToPath(target));
