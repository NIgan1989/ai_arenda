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
 assert.equal(sheetTitle('owner','bookings'),'Заявки гостей');
 assert.equal(sheetTitle('guest','bookings'),'Мои брони');
});

test('a phone has no bottom bar and no floating AI button: the map carries the menu and the chats',()=>{
 const nav=readFileSync(new URL('../components/workspace-navigation.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../components/workspace-release.css',import.meta.url),'utf8'),shell=readFileSync(new URL('../components/map-shell.css',import.meta.url),'utf8'),chrome=readFileSync(new URL('../components/map-chrome.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(nav+css,/release-bottom-nav/);
 assert.match(shell,/\.map-shell \.administrator-orb\{display:none!important\}/);
 assert.match(chrome,/\/account/);assert.match(chrome,/\/chats/);
});
