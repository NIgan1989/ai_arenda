import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {demandCells,BOOK_WEIGHT}=await load('owner-demand');
const {mapSearch,saveMapPoint}=await load('map-workspace');

test('demand is summed per public cell and shown as shares of the busiest cell',()=>{
 const cells=demandCells([
  {longitude:76.951,latitude:52.281,asks:2,books:0},
  {longitude:76.958,latitude:52.289,asks:1,books:1},
  {longitude:76.97,latitude:52.3,asks:1,books:0},
  {longitude:76.99,latitude:52.31,asks:0,books:0},
  {longitude:NaN,latitude:52.3,asks:5,books:5}
 ]);
 assert.equal(cells.length,2);
 assert.deepEqual(cells[0],{longitude:76.955,latitude:52.285,weight:1});
 assert.equal(cells[1].weight,Math.round(1/(3+BOOK_WEIGHT)*100)/100);
 assert.deepEqual(demandCells([]),[]);
});

test('the owner map carries the city demand without any guest point; guests do not get it',async()=>{
 const f=await fixture();try{
  await saveMapPoint(f.owner,'owner',{propertyId:f.property,longitude:76.95123,latitude:52.28765,confirmed:true,version:0});
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);
  const city=f.db.raw.prepare('SELECT city FROM properties WHERE id=?').get(f.property).city;
  f.db.raw.prepare("INSERT INTO matching_requests(id,guest_id,request_key,filters,status,created_at,expires_at) VALUES ('r1',?,'k1',?,'searching',?,?)").run(f.guestId||f.db.raw.prepare('SELECT guest_id FROM bookings LIMIT 1').get().guest_id,JSON.stringify({city,near:{longitude:76.91,latitude:52.25,radius:5000}}),now(),now()+600);
  // Only a guest still waiting for an answer counts; a ready request with a pending offer still does.
  assert.equal((await mapSearch(f.owner,'owner',{filters:{city}})).demand.searching,0);
  f.db.raw.prepare("INSERT INTO matching_offers(id,request_id,property_id,owner_id,status,amount,policy_version,created_at,expires_at) VALUES ('o1','r1',?,?,'pending',10000,1,?,?)").run(f.property,f.db.raw.prepare('SELECT owner_id FROM properties WHERE id=?').get(f.property).owner_id,now(),now()+120);
  f.db.raw.prepare("UPDATE matching_requests SET status='ready' WHERE id='r1'").run();
  const owner=await mapSearch(f.owner,'owner',{filters:{city}});
  assert.ok(owner.demand);
  assert.equal(owner.demand.searching,1);
  assert.ok(owner.demand.cells.length>=1);
  assert.ok(!JSON.stringify(owner.demand).includes('76.91'));
  assert.ok(owner.demand.cells.every(c=>c.weight>0&&c.weight<=1));
  assert.equal((await mapSearch(f.guest,'guest',{filters:{city}})).demand,undefined);
 }finally{f.db.close();}
});
