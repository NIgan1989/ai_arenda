import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = new URL('../server/generated/', import.meta.url);
mkdirSync(target, {recursive:true});
// Native and web clients share the same booking and cleaning rules.
for (const name of ['service','domain','operations','assistant','access','rental-policy','account','approvals']) {
  const source = readFileSync(new URL(`../../lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
    .replace("from './domain'", "from './domain.js'").replace("from './ai'", "from './ai.js'").replace("from './operations'", "from './operations.js'").replace("from './assistant'", "from './assistant.js'").replace("from './access'", "from './access.js'").replace("from './rental-policy'", "from './rental-policy.js'").replace("from './account'", "from './account.js'").replace("from './approvals'", "from './approvals.js'");
  writeFileSync(new URL(name+'.js', target), js);
}
// Native pilot deliberately has no external language-model connection.
writeFileSync(new URL('ai.js',target), 'export async function generateAnswer(config,text,role,history,fallback){ return {text:fallback}; }\n');
const schema=readFileSync(new URL('../../drizzle/0000_boring_unus.sql', import.meta.url), 'utf8');
writeFileSync(new URL('schema.sql',target),schema);
writeFileSync(new URL('0001_rental_operations.sql',target),readFileSync(new URL('../../drizzle/0001_rental_operations.sql',import.meta.url),'utf8'));
console.log('Shared server prepared:',fileURLToPath(target));

writeFileSync(new URL('0002_assistant_preferences.sql',target),readFileSync(new URL('../../drizzle/0002_assistant_preferences.sql',import.meta.url),'utf8'));
writeFileSync(new URL('0003_owner_calendar.sql',target),readFileSync(new URL('../../drizzle/0003_owner_calendar.sql',import.meta.url),'utf8'));
writeFileSync(new URL('0004_account_settings.sql',target),readFileSync(new URL('../../drizzle/0004_account_settings.sql',import.meta.url),'utf8'));

writeFileSync(new URL('0005_activity_approvals.sql',target),readFileSync(new URL('../../drizzle/0005_activity_approvals.sql',import.meta.url),'utf8'));
