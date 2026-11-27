import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const app=read('mobile/App.tsx'),check=read('mobile/src/StayCheck.tsx');

test('a questionnaire saved by an older version never reopens «Сводка» on start',()=>{
 assert.match(app,/const keptFlow=\(_flow:Flow\|null\|undefined\):Flow\|null=>null;/);
});

test('no role has «Сводка»: an empty sheet goes back to the map instead of the board and the chat under it',()=>{
 assert.match(app,/const bareSheet=!!selectedRole&&pageId==='overview'&&!dealOpen&&!flow&&!placeMsg&&!stayMsg&&!editMsg&&!openForm;/);
 assert.match(app,/useEffect\(\(\)=>\{if\(bareSheet\)backToMap\(\);\},\[bareSheet\]\);/);
 // the board is no longer the page's own block
 assert.match(app,/block:pageId==='overview'\?undefined:/);
});

test('an open form with a refusal under it keeps the sheet',()=>{
 assert.match(app,/const openForm=said\.some\(m=>\['stay-form','review','property-quick','property-editor','property-settings','auth'\]\.includes\(String\(m\.block\)\)&&!m\.done\);/);
});

test('«Вы заселились?» shows the line «Мои брони» on the map even without another booking',()=>{
 const home=read('mobile/src/MapHome.tsx');
 assert.match(home,/const stayChecks=\(data\.approvals\|\|\[\]\)\.filter\(\(c:Row\)=>c\.kind==='stay-check'&&c\.canDecide\)\.length;/);
 assert.equal((home.match(/\(tripThreads\.length>0\|\|stayChecks>0\)/g)||[]).length,2);
});

test('«Вы заселились?» is asked on the cancelled booking in «Мои брони», the answer is a line on the card',()=>{
 assert.match(app,/c\.id==='stay-check:'\+id&&c\.canDecide/);
 assert.match(app,/<StayCheck key=\{'stay-check:'\+id\}/);
 // the answer is quiet: no chat message (perform's last argument)
 assert.match(app,/perform\('approvals',body,uid\(\),undefined,false,true\)/);
 // an open question keeps the booking in «Активные»
 assert.match(app,/selectedRole==='guest'&&\(stayCheckOf\(b\.id\)\|\|stayChecked\[b\.id\]\)\?'active'/);
 assert.match(check,/if\(said\)return <Text/);
});
