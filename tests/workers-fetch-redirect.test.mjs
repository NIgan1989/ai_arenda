import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

// Cloudflare Workers throw a TypeError for redirect:'error' before sending anything,
// so server code must use 'manual' and treat a 3xx answer as a failure.
const files=dir=>readdirSync(dir).flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?files(p):/\.(ts|tsx|mjs|js)$/.test(n)?[p]:[];});
test('server code never asks Workers for the unsupported redirect mode',()=>{
 const offenders=['lib','app','build'].flatMap(files).filter(f=>/redirect\s*:\s*['"]error['"]/.test(readFileSync(f,'utf8')));
 assert.deepEqual(offenders,[]);
});
