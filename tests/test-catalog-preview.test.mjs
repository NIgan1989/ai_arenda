import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {mapSearch}=await load('map-workspace');
test('only server-configured isolated catalogue previews synthetic listings; admission still gates bookings',async()=>{
 const f=await fixture();try{
 f.db.raw.prepare("UPDATE properties SET published=1,description='СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ · учебная квартира' WHERE id=?").run(f.property);
 f.db.raw.prepare('UPDATE pilot_policy SET require_owner_review=1,require_phone=1').run();
 assert.equal((await f.guest.publicSearch({})).total,0);
 assert.equal((await mapSearch(f.guest,'guest',{filters:{},syntheticPreview:true})).total,0);
 const preview=await mapSearch(f.guest,'guest',{filters:{}},{TEST_DATA_ONLY:'1'});
 assert.equal(preview.total,1);assert.equal(preview.properties[0].test_preview,1);assert.equal(preview.properties[0].address,undefined);
 await assert.rejects(f.guest.createBooking({propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),guests:1,billingMode:'hourly',acceptTerms:true,requestKey:'preview-only'}),e=>e.status===409);
 f.db.raw.prepare("UPDATE properties SET description='Обычное объявление' WHERE id=?").run(f.property);
 assert.equal((await mapSearch(f.guest,'guest',{filters:{}},{TEST_DATA_ONLY:'1'})).total,0);
 }finally{f.db.close();}
});
