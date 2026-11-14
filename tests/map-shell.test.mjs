import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {load} from './helpers/platform.mjs';
const {workspaceTarget,sheetTitle}=await load('map-shell'),{rolePages}=await load('access');
const origin='https://ai-arenda.example',owner=rolePages.owner.map(p=>p.id);

test('a link to a section of the same workspace opens as a sheet over the map',()=>{
 assert.deepEqual(workspaceTarget('/workspace/owner/bookings',origin,'owner',owner),{section:'bookings',search:'',path:'/workspace/owner/bookings'});
 assert.deepEqual(workspaceTarget(origin+'/workspace/owner/operations?tab=finance',origin,'owner',owner),{section:'operations',search:'?tab=finance',path:'/workspace/owner/operations?tab=finance'});
 assert.equal(workspaceTarget('/workspace/owner/map',origin,'owner',owner).section,'map');
});

test('another role, another site and unknown addresses are left to the browser',()=>{
 assert.equal(workspaceTarget('/workspace/guest/bookings',origin,'owner',owner),null);
 assert.equal(workspaceTarget('https://other.example/workspace/owner/bookings',origin,'owner',owner),null);
 assert.equal(workspaceTarget('/workspace/owner/unknown',origin,'owner',owner),null);
 assert.equal(workspaceTarget('/workspace/owner/bookings/extra',origin,'owner',owner),null);
 assert.equal(workspaceTarget('/admin',origin,'owner',owner),null);
 assert.equal(workspaceTarget('/join/cleaner',origin,'owner',owner),null);
 assert.equal(workspaceTarget('javascript:alert(1)',origin,'owner',owner),null);
});

test('every section of every role has a name for the head of its sheet',()=>{
 for(const role of ['guest','owner','cleaner'])for(const page of rolePages[role])if(page.id!=='map')assert.ok(sheetTitle(role,page.id),role+'/'+page.id);
 assert.equal(sheetTitle('owner','account'),'Меню');
 assert.equal(sheetTitle('owner','bookings'),'Заявки');
 assert.equal(sheetTitle('guest','bookings'),'Мои брони');
});

test('a phone has no bottom bar and no floating AI button: the map carries the menu and the chats',()=>{
 const nav=readFileSync(new URL('../components/workspace-navigation.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../components/workspace-release.css',import.meta.url),'utf8'),shell=readFileSync(new URL('../components/map-shell.css',import.meta.url),'utf8'),chrome=readFileSync(new URL('../components/map-chrome.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(nav+css,/release-bottom-nav/);
 assert.match(shell,/\.map-shell \.administrator-orb\{display:none!important\}/);
 assert.match(chrome,/\/account/);assert.match(chrome,/\/chats/);
});

test('the menu is short: five rows open their own screens, the rest stays one tap away', async () => {
  const { readFileSync } = await import('node:fs');
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  for (const text of [read('components/account-control.tsx'), read('mobile/src/AccountControl.tsx')]) {
    // «journal» is the short row «Что сделал ИИ» of the guest and the owner; the cleaner reads the same journal inside «plan».
    // The owner's plan is paid per flat, so it is switched in the flat's settings, not in the menu.
    assert.match(text, /type MenuView=''\|'profile'\|'trust'\|'plan'\|'journal'\|'settings'\|'safety'/);
    assert.match(text, /!worker&&[^<]*'Что сделал ИИ'|!worker&&journal\.length>0&&<Row title="Что сделал ИИ"/, 'the journal row is the guest\'s and the owner\'s');
    assert.match(text, /worker&&(open\(Sparkles,|<Row title=)["']Тариф и автопилот/, 'only the cleaner has the plan in the menu');
    for (const view of ['profile', 'trust', 'plan', 'settings', 'safety']) assert.ok(text.includes("view==='" + view + "'"), view);
    assert.match(text, /'properties'\]:\['jobs'\]/, "the owner's objects and the cleaner's search for jobs live on the map");
  }
  assert.match(read('mobile/src/WorkspaceNavigation.tsx'), /Чаты, непрочитанных: /);
  assert.match(read('mobile/App.tsx'), /<MapChatsButton busy=\{busy\} unread=\{unread\}/);
});
