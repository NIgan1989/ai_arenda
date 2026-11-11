import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {mapPoint,groupMapMarkers,rentalMarkerLabel,rasterMapPadding}=await load('map-rendering');
test('compatible map uses only supplied coordinates and rejects invalid or missing positions',()=>{
 for(const value of [null,[],[NaN,52],[76,Infinity],[181,52],[76,90],['76',52]])assert.equal(mapPoint(value),null);
 assert.deepEqual(mapPoint([76.95,52.287]),[76.95,52.287]);
 const items=[{id:'a',location:{longitude:76,latitude:52}},{id:'b',location:{longitude:76.01,latitude:52}},{id:'c',address:'PRIVATE ADDRESS'},{id:'d',location:{longitude:80,latitude:52}}];
 const project=([x,y])=>({x:x*100,y:y*100});
 assert.deepEqual(groupMapMarkers(items,project,11).map(g=>g.items.map(p=>p.id)),[['a','b'],['d']]);
 assert.equal(groupMapMarkers(items,project,16).length,3);assert.deepEqual(items[2],{id:'c',address:'PRIVATE ADDRESS'});
});
test('map amounts and viewport leave usable space above the mobile sheet',()=>{
 assert.equal(rentalMarkerLabel({price:14000,estimate:{amount:28000}}),'28 тыс.');assert.equal(rentalMarkerLabel({price:NaN}),'Объект');assert.equal(rentalMarkerLabel({kind:'job',price:4000}),'Уборка');
 for(const [width,height] of [[390,844],[320,568],[1440,900]])for(const sheet of [0,1,2]){const p=rasterMapPadding(width,height,sheet);assert.ok(p.topLeft[0]+p.bottomRight[0]<width);assert.ok(p.topLeft[1]+p.bottomRight[1]<height);}
});
