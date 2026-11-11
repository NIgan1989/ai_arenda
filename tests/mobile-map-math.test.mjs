import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
mkdirSync('outputs',{recursive:true});
const output=mkdtempSync(resolve('outputs/mobile-map-math-test-'));
writeFileSync(resolve(output,'map-math.mjs'),ts.transpileModule(readFileSync('mobile/src/map-math.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {project,unproject,fitView,visibleTiles,stayInterval,kzTime,countdown,validPoint}=await import(pathToFileURL(resolve(output,'map-math.mjs')).href);

test('projection round-trips Kazakhstan coordinates and rejects invalid points',()=>{
 const point=[76.95,52.287],p=project(point,12),back=unproject(p.x,p.y,12);
 assert.ok(Math.abs(back[0]-point[0])<1e-9&&Math.abs(back[1]-point[1])<1e-9);
 assert.equal(validPoint([200,10]),null);assert.equal(validPoint(['76','52']),null);assert.deepEqual(validPoint(point),point);
});
test('fitted view keeps every point inside the visible area',()=>{
 const points=[[76.90,52.25],[77.02,52.31]],view=fitView(points,300,400,15),c=project(view.center,view.zoom);
 for(const point of points){const p=project(point,view.zoom);assert.ok(Math.abs(p.x-c.x)<=150&&Math.abs(p.y-c.y)<=200);}
 assert.equal(fitView([[76.95,52.287]],300,400,15).zoom,15);assert.equal(fitView([],300,400),null);
});
test('visible tiles cover the viewport without duplicates',()=>{
 const tiles=visibleTiles([76.95,52.287],12,390,700);
 assert.equal(new Set(tiles.map(t=>t.key)).size,tiles.length);
 assert.ok(tiles.some(t=>t.left<=0&&t.top<=0)&&tiles.some(t=>t.left+256>=390&&t.top+256>=700));
 assert.ok(tiles.every(t=>t.x>=0&&t.x<4096&&t.y>=0&&t.y<4096));
});
test('stay intervals use Kazakhstan wall-clock time',()=>{
 const now=Date.parse('2026-11-11T18:30:00Z');// 23:30 on 11 November in UTC+5
 assert.equal(kzTime(1,14,now).toISOString(),'2026-11-12T09:00:00.000Z');
 assert.deepEqual(stayInterval('daily',1,14,2,now),{start:'2026-11-12T09:00:00.000Z',end:'2026-11-14T07:00:00.000Z'});
 assert.deepEqual(stayInterval('hourly',1,10,3,now),{start:'2026-11-12T05:00:00.000Z',end:'2026-11-12T08:00:00.000Z'});
 assert.equal(countdown(125),'2:05');assert.equal(countdown(-4),'0:00');
});
