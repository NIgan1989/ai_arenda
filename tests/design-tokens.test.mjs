import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webCss,mobileTs,tokens} from '../scripts/build-design-tokens.mjs';
import {cssFiles,nativeFiles,snapCss,snapNative,snapFont,snapSpace,snapRadius,snapControl} from '../scripts/design-scale.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('web and mobile token files are generated from design/tokens.json',()=>{
 assert.equal(read('app/tokens.css'),webCss());
 assert.equal(read('mobile/src/tokens.ts'),mobileTs());
});
test('the scale keeps text readable and touch targets reachable',()=>{
 assert.ok(Math.min(...Object.values(tokens.font).map(f=>f[0]))>=12);
 assert.ok(tokens.control.touch>=44);
 assert.ok(tokens.font.body[0]>=16);
 assert.ok(tokens.space.every(x=>x<=2||x%4===0));
});
test('snapping is stable',()=>{
 for(let n=0;n<=80;n++)for(const snap of [snapFont,snapSpace,snapRadius,snapControl])assert.equal(snap(snap(n)),snap(n));
 assert.equal(snapFont(9),12);assert.equal(snapFont(13),14);assert.equal(snapSpace(-6),-8);assert.equal(snapRadius(30),24);assert.equal(snapControl(46),48);
});
test('every stylesheet and mobile screen stays on the shared scale',()=>{
 for(const file of cssFiles())assert.equal(snapCss(read(file)),read(file),file);
 for(const file of nativeFiles())assert.equal(snapNative(read(file)),read(file),file);
});
test('mobile screens take colours from tokens',()=>{
 for(const file of nativeFiles())assert.doesNotMatch(read(file),/'#[0-9a-fA-F]{3,6}'/,file);
});
