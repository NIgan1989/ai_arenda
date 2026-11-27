import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';
const {shareCard,shareLink,shareMessage,readShareStay,shareDates,dataUrlBytes,readStayLink}=await load('stay-share');

const publish=(f,id)=>f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(id);

test('«Поделиться»: a published home gives a card without the address; a hidden one gives nothing',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
  assert.equal(await shareCard(f.db,f.property),null);
  publish(f,f.property);
  const card=await shareCard(f.db,f.property);
  assert.equal(card.id,f.property);assert.ok(card.title);assert.equal(card.unit,'day');assert.ok(card.price>0);
  assert.equal(JSON.stringify(card).includes(f.db.raw.prepare('SELECT address FROM properties WHERE id=?').get(f.property).address),false);
  f.db.raw.prepare('UPDATE properties SET archived_at=1 WHERE id=?').run(f.property);
  assert.equal(await shareCard(f.db,f.property),null);
  assert.equal(await shareCard(f.db,'../etc'),null);
 }finally{f.db.close();}
});

test('the link carries only the place, the days and the guests',()=>{
 const link=shareLink('https://ai-arenda.example','p1',{start:'2026-11-27',end:'2026-11-28',guests:2});
 assert.equal(link,'https://ai-arenda.example/s/p1?d=2026-11-27~2026-11-28&g=2');
 assert.equal(shareLink('https://ai-arenda.example','p1'),'https://ai-arenda.example/s/p1');
 assert.deepEqual(readShareStay(new URL(link).searchParams),{start:'2026-11-27',end:'2026-11-28',guests:2});
 // Days out of order, too far apart or not days at all are dropped, not trusted.
 for(const d of ['2026-11-28~2026-11-27','2026-11-01~2027-02-01','x~y','2026-13-40~2026-13-41'])assert.equal(readShareStay(new URLSearchParams({d})),null);
 assert.equal(readShareStay(new URLSearchParams({d:'2026-11-27~2026-11-28',g:'999'})).guests,50);
 assert.equal(shareDates({start:'2026-11-27',end:'2026-11-28',guests:1}),'27–28 ноября');
 assert.equal(shareDates({start:'2026-11-30',end:'2026-12-02',guests:1}),'30 ноября – 2 декабря');
 const text=shareMessage({title:'Гостиница «Шаңырақ»',price:18000,unit:'day',city:'Павлодар'},link,{start:'2026-11-27',end:'2026-11-28',guests:2});
 assert.equal(text.split('\n').length,3);assert.match(text,/18 000 ₸ за сутки · Павлодар · 27–28 ноября/);assert.ok(text.endsWith(link));
 // A hall without a fixed price says no price.
 assert.doesNotMatch(shareMessage({title:'Зал',price:0,unit:'',city:'Павлодар'},link),/₸/);
});

test('the preview photo is plain bytes of an image, nothing else',()=>{
 const one=dataUrlBytes('data:image/png;base64,iVBORw0K');assert.equal(one.type,'image/png');assert.equal(one.bytes[1],0x50);
 assert.equal(dataUrlBytes('data:text/html;base64,PGI+'),null);
 assert.equal(dataUrlBytes('https://x/y.jpg'),null);
});

test('the app opens only a shared place of its own server',()=>{
 const base='https://ai-arenda.example';
 assert.deepEqual(readStayLink('aiarenda://stay/p1?d=2026-11-27~2026-11-28&g=3',base),{id:'p1',stay:{start:'2026-11-27',end:'2026-11-28',guests:3}});
 assert.deepEqual(readStayLink(base+'/s/p1',base),{id:'p1',stay:null});
 for(const bad of ['https://evil.example/s/p1','http://ai-arenda.example/s/p1',base+'/s/p1/x',base+'/workspace/guest/map','aiarenda://stay/..%2Fx','aiarenda://workspace/guest/map',42,'x'.repeat(600)])assert.equal(readStayLink(bad,base),null,String(bad).slice(0,40));
});
