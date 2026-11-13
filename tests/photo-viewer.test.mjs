import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../components/photo-viewer.tsx',import.meta.url),'utf8');

test('photo viewer never hands the lightbox an undefined portal',()=>{
 // portal={undefined} replaces the library default and the viewer crashes on portal.root when a flat photo is opened.
 assert.doesNotMatch(source,/portal=\{[^}]*undefined/);
 assert.match(source,/root\?\{portal:\{root\}\}:\{\}/);
});
