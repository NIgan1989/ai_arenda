import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
mkdirSync('outputs/entry-test',{recursive:true});writeFileSync('outputs/entry-test/entry.js',ts.transpileModule(readFileSync('lib/entry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {safeEntryReturn,defaultGuestPath,bookingEntryPath}=await import(pathToFileURL(process.cwd()+'/outputs/entry-test/entry.js'));
test('entry redirects stay inside the app and cannot loop back to authentication',()=>{
 for(const input of ['https://other.test','//other.test','/\\other.test','javascript:alert(1)','/signin?next=/signin','/api/admin/users',null])assert.equal(safeEntryReturn(input),defaultGuestPath);
 assert.equal(safeEntryReturn('/join/owner'),'/join/owner');assert.equal(safeEntryReturn('/workspace/guest/catalog?book=p1'),'/workspace/guest/catalog?book=p1');
});
test('booking intent keeps property, local Kazakhstan times, guests and tariff through login',()=>{
 const path=bookingEntryPath('p&1',{city:'Павлодар',start:'2026-11-01T14:00',end:'2026-11-01T17:00',guests:'2',mode:'hourly'});
 assert.equal(safeEntryReturn(path),path);const url=new URL(path,'https://arenda.local');assert.equal(url.pathname,'/workspace/guest/catalog');for(const [key,value] of Object.entries({book:'p&1',city:'Павлодар',start:'2026-11-01T14:00',end:'2026-11-01T17:00',guests:'2',mode:'hourly'}))assert.equal(url.searchParams.get(key),value);
});
