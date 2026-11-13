import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
mkdirSync('outputs',{recursive:true});
const output=mkdtempSync(resolve('outputs/mobile-loading-test-'));
writeFileSync(output+'/loading.js',ts.transpileModule(readFileSync('mobile/src/loading.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const loading=await import(pathToFileURL(output+'/loading.js'));

test('a background request never lights the loading line; one that follows a tap does, until it settles',t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});
 let calls=0;const off=loading.subscribeLoading(()=>calls++);
 assert.equal(loading.trackRequest(),null);assert.equal(loading.loadingBusy(),false);assert.equal(calls,0);
 loading.markGesture();t.mock.timers.tick(400);
 const first=loading.trackRequest(),second=loading.trackRequest();assert.equal(typeof first,'function');assert.equal(loading.loadingBusy(),true);
 first();first();assert.equal(loading.loadingBusy(),true);second();assert.equal(loading.loadingBusy(),false);
 // A request sent right after the action's answer (save, then reload) still belongs to it, long after the tap itself.
 t.mock.timers.tick(5000);loading.markGesture();t.mock.timers.tick(1400);const save=loading.trackRequest();t.mock.timers.tick(4000);save();
 t.mock.timers.tick(200);const reload=loading.trackRequest();assert.equal(typeof reload,'function');reload();
 t.mock.timers.tick(400);assert.equal(loading.trackRequest(),null);
 off();const before=calls;loading.markGesture();loading.trackRequest()();assert.equal(calls,before);
});

test('the entry splash is released once and listeners hear it',()=>{
 let calls=0;const off=loading.subscribeLoading(()=>calls++);
 assert.equal(loading.isEntryReady(),false);loading.entryReady();loading.entryReady();
 assert.equal(loading.isEntryReady(),true);assert.equal(calls,1);off();
});

test('the site shows the splash once per session and the loading line from the first paint',()=>{
 const layout=readFileSync('app/layout.tsx','utf8'),splash=readFileSync('components/entry-splash.tsx','utf8'),loader=readFileSync('components/app-loader.tsx','utf8');
 assert.match(layout,/<EntrySplash\/><AppLoader\/>/);
 assert.match(splash,/sessionStorage\.getItem\('ai-arenda-entry'\)/);assert.match(splash,/prefers-reduced-motion/);assert.match(splash,/entry-splash-fallback/);
 assert.match(loader,/useState\(true\)/);assert.match(loader,/beforeunload/);assert.match(loader,/GESTURE_WINDOW/);
});

test('while a screen shows its own «thinking» dots the long-action pill stays away',()=>{
 assert.equal(loading.localThinking(),false);
 const first=loading.thinkingShown(),second=loading.thinkingShown();assert.equal(loading.localThinking(),true);
 first();first();assert.equal(loading.localThinking(),true);second();assert.equal(loading.localThinking(),false);
});

test('every wait in the product uses the one «thinking» sign, not a spinner of its own',()=>{
 const sources=dir=>readdirSync(dir).filter(f=>f.endsWith('.tsx')).map(f=>dir+'/'+f);
 for(const file of [...sources('components'),'app/chat.tsx'])assert.doesNotMatch(readFileSync(file,'utf8'),/<LoaderCircle\b/,file+' shows its own spinner; use <Thinking/> from components/thinking.tsx');
 for(const file of [...sources('mobile/src'),'mobile/App.tsx'])assert.doesNotMatch(readFileSync(file,'utf8'),/<ActivityIndicator\b/,file+' shows the system spinner; use <Thinking/> from mobile/src/Thinking.tsx');
 const loader=readFileSync('components/app-loader.tsx','utf8'),css=readFileSync('app/loader.css','utf8');
 assert.match(loader,/<Thinking size="sm"\/>/);assert.match(loader,/localThinking\(\)/);assert.match(css,/@keyframes thinking-wave/);
});

test('the entry story is long enough to be watched and still releases itself',()=>{
 const app=readFileSync('mobile/src/EntrySplash.tsx','utf8'),site=readFileSync('components/entry-splash.tsx','utf8');
 const story=Number(app.match(/MIN_STORY=(\d+)/)[1]),cap=Number(app.match(/MAX_WAIT=(\d+)/)[1]);
 assert.ok(story>=3000&&story<=4500,'app story '+story);assert.ok(cap>story&&cap<=8000);
 const siteStory=Number(site.match(/calm\?450:(\d+)/)[1]),siteCap=Number(site.match(/setTimeout\(leave,(\d+)\)/)[1]);
 assert.ok(siteStory>=3000&&siteStory<=4500,'site story '+siteStory);assert.ok(siteCap>siteStory&&siteCap<=8000);
});
