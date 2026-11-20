import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {withWords} from './helpers/i18n.mjs';
mkdirSync('outputs',{recursive:true});
const output=mkdtempSync(resolve('outputs/mobile-arrival-test-'));
writeFileSync(resolve(output,'arrival.mjs'),withWords(ts.transpileModule(readFileSync('mobile/src/arrival.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText,output));
const {homeAt,pinWords,cardWords,countsAt,shiftDraft,arrivalOf,clock}=await import(pathToFileURL(resolve(output,'arrival.mjs')).href);

// 18:00 in Kazakhstan (UTC+5).
const six=Date.parse('2026-11-20T18:00:00+05:00')/1000,arrival={steps:[six-1800,six,six+1800,six+3600],at:six};
test('a pin says what the home is at the chosen arrival',()=>{
 assert.equal(clock(six),'18:00');
 assert.deepEqual(homeAt({arrival:'-r--'},arrival,six),{state:'ready'});
 assert.deepEqual(homeAt({arrival:'-c--'},arrival,six),{state:'check'});
 assert.deepEqual(homeAt({arrival:'---r'},arrival,six),{state:'later',from:six+3600});
 assert.deepEqual(homeAt({arrival:'r---'},arrival,six),{state:'busy'});
 assert.equal(pinWords({state:'ready'}),'');assert.equal(pinWords({state:'check'}),'Уточняем');assert.equal(pinWords({state:'later',from:six+3600}),'После 19:00');assert.equal(pinWords({state:'busy'}),'Занято');
 assert.match(cardWords({state:'check'},six),/^Уточняем готовность/);assert.equal(cardWords({state:'later',from:six+3600},six),'Доступно с 19:00');
 // An answer without codes (an older server) is never called «busy».
 assert.deepEqual(homeAt({},arrival,six),{state:'ready'});
 assert.deepEqual(countsAt([{arrival:'-r--'},{arrival:'-c-r'},{}],arrival),[0,2,0,1]);
 assert.equal(arrivalOf({arrival:{steps:[1],at:1}}),null);
});
test('moving the arrival keeps the length of the stay, in Kazakhstan time',()=>{
 const d=shiftDraft({start:'2026-11-20T18:00',end:'2026-11-20T21:00',now:true},six+3600);
 assert.equal(d.start,'2026-11-20T19:00');assert.equal(d.end,'2026-11-20T22:00');assert.equal(d.now,false);
 assert.equal(shiftDraft({start:'2026-11-20T23:00',end:'2026-11-21T23:00'},Date.parse('2026-11-21T00:30:00+05:00')/1000).end,'2026-11-22T00:30');
});
