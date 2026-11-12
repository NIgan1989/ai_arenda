// Transpiles pure TypeScript modules (no React Native imports) into a temporary folder so node can run them.
import ts from 'typescript';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

// files are repo-relative paths; the first one is imported and returned.
export async function loadPure(...files) {
  const output = mkdtempSync(join(tmpdir(), 'ai-arenda-mobile-'));
  for (const file of files) {
    const js = ts
      .transpileModule(readFileSync(join(repo, file), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}})
      .outputText.replace(/from '(\.{1,2}\/[^']+)'/g, (_, name) => `from '${name}.mjs'`);
    const target = join(output, file.replace(/\.ts$/, '.mjs'));
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, js);
  }
  return import(pathToFileURL(join(output, files[0].replace(/\.ts$/, '.mjs'))).href);
}
