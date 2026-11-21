import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {withWords} from './helpers/i18n.mjs';
mkdirSync('outputs',{recursive:true});
const output=mkdtempSync(resolve('outputs/mobile-here-test-'));
const js=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./map-math'","'./map-math.mjs'");
writeFileSync(resolve(output,'map-math.mjs'),js('mobile/src/map-math.ts'));
writeFileSync(resolve(output,'here-rules.mjs'),withWords(js('mobile/src/here-rules.ts'),output));
const {nearestCity,distanceKm,betterFix,isFresh,accuracyRadius,hereNote,FRESH_FIX}=await import(pathToFileURL(resolve(output,'here-rules.mjs')).href);

test('the nearest city of the service is found within its suburbs only',()=>{
 assert.equal(nearestCity([76.97,52.30]),'Павлодар');
 assert.equal(nearestCity([76.92,43.25]),'Алматы');
 assert.equal(nearestCity([71.40,51.16]),'Астана');
 // Between cities, far from all of them: no city is guessed.
 assert.equal(nearestCity([74.5,47.5]),null);
 // Moscow is not a city of the service.
 assert.equal(nearestCity([37.62,55.75]),null);
 assert.ok(Math.abs(distanceKm([76.95,52.287],[76.89,43.24])-1006)<15);
});

test('a fresh measured point replaces a remembered one, a much worse one does not replace a good one',()=>{
 const now=1_800_000_000_000;
 const remembered={point:[76.9,52.2],accuracy:30,at:now-60000,rough:true};
 const measured={point:[76.95,52.28],accuracy:800,at:now,rough:false};
 assert.equal(betterFix(null,measured),true);
 assert.equal(betterFix(remembered,measured),true);
 const good={point:[76.95,52.28],accuracy:20,at:now,rough:false};
 assert.equal(betterFix(good,{...measured,at:now+5000}),false);
 assert.equal(betterFix(good,{...measured,at:now+70000}),true);
 assert.equal(betterFix(good,{...good,at:now-1}),false);
 assert.equal(isFresh(good,now+FRESH_FIX-1),true);
 assert.equal(isFresh(good,now+FRESH_FIX+1),false);
 assert.equal(isFresh(remembered,now),false);
});

test('the accuracy circle grows as the map zooms in and stays within the screen',()=>{
 const far=accuracyRadius(100,52.287,12),near=accuracyRadius(100,52.287,15);
 assert.ok(near>far*7&&near<far*9);
 assert.equal(accuracyRadius(50000,52.287,18),240);
});

test('every failure says what to do and keeps the map on a city',()=>{
 for(const status of ['blocked','denied','off','failed']){
  const note=hereNote(status,'Павлодар',true,'ios');
  assert.ok(note.text.includes('Павлодар'));
  assert.ok(note.actions.includes('pick'));
  assert.ok(note.actions.length>=2);
 }
 assert.deepEqual(hereNote('blocked','Павлодар',false,'android').actions,['settings']);
 assert.deepEqual(hereNote('failed','Алматы',false,'android').actions,['retry']);
 assert.equal(hereNote('found','Павлодар',true,'ios'),null);
 assert.equal(hereNote('searching','Павлодар',true,'ios'),null);
});
