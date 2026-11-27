import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const app=read('mobile/App.tsx'),check=read('mobile/src/StayCheck.tsx');

test('a questionnaire saved by an older version never reopens «Сводка» on start',()=>{
 assert.match(app,/const keptFlow=\(_flow:Flow\|null\|undefined\):Flow\|null=>null;/);
});

test('the guest has no «Сводка»: an empty sheet goes back to the map instead of the board and the chat under it',()=>{
 assert.match(app,/const guestBare=selectedRole==='guest'&&pageId==='overview'&&!dealOpen&&!flow&&!placeMsg&&!stayMsg&&!editMsg;/);
 assert.match(app,/useEffect\(\(\)=>\{if\(guestBare\)backToMap\(\);\},\[guestBare\]\);/);
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
