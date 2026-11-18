import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';

test('a showing is counted per published object per day and the owner sees the week',async()=>{
 const f=await fixture(),{recordViews,viewDay,viewIds}=await load('property-views'),t=now();
 f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);
 assert.deepEqual(await recordViews(f.db,{ids:[f.property,f.property,'no-such',7]},t),{counted:1});
 await recordViews(f.db,{ids:[f.property]},t);
 await recordViews(f.db,{ids:[f.property]},t-3*86400);
 assert.deepEqual(f.db.raw.prepare('SELECT day,shown FROM property_views ORDER BY day').all().map(r=>({...r})),[{day:viewDay(t)-3,shown:1},{day:viewDay(t),shown:2}]);
 const state=await f.owner.roleState('owner');
 assert.equal(state.ownProperties.find(p=>p.id===f.property).views_week,3);
 // Older than a week is not in the owner's number; older than a month is dropped at the next showing.
 f.db.raw.prepare('INSERT INTO property_views VALUES (?,?,5),(?,?,9)').run(f.property,viewDay(t)-8,f.property,viewDay(t)-40);
 assert.equal((await f.owner.roleState('owner')).ownProperties.find(p=>p.id===f.property).views_week,3);
 await recordViews(f.db,{ids:[f.property]},t);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_views WHERE day<?').get(viewDay(t)-30).n,0);
 assert.deepEqual(viewIds({ids:'x'}),[]);assert.deepEqual(viewIds(null),[]);
 assert.equal(viewIds({ids:Array.from({length:200},(_,i)=>'p'+i)}).length,60);
});

test('a hidden object is not counted',async()=>{
 const f=await fixture(),{recordViews}=await load('property-views');
 f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
 assert.deepEqual(await recordViews(f.db,{ids:[f.property]}),{counted:0});
 assert.deepEqual(await recordViews(f.db,{}),{counted:0});
});
