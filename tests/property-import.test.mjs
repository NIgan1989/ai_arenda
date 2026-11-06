import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {parsePropertyCSV,previewPropertyImport,commitPropertyImport,importState}=await load('property-import');
const apartment=(i=1)=>({title:'Imported '+i,city:'Павлодар',district:'Центр',address:'Свой адрес '+i,description:'Описание своего объекта '+i,price:15000,rooms:1,capacity:2,cleaningMinutes:90,externalId:'external-'+i});
const request=rows=>({source:'manual',format:'json',content:JSON.stringify(rows)});
const confirm=p=>({id:p.id,expectedVersion:p.version,payloadHash:p.payloadHash,rowNumbers:p.rows.filter(r=>r.status==='ready').map(r=>r.number),confirmed:true});

test('CSV handles BOM, semicolons, quotes and embedded lines without evaluating formulas',()=>{
 const csv='\uFEFFtitle;city;district;address;description;price;rooms;capacity;cleaningMinutes;externalId\r\n"Уютная; квартира";Павлодар;Центр;Адрес 1;"Строка 1\nСтрока ""два""";15000;1;2;90;=1+1\r\n';
 const rows=parsePropertyCSV(csv);assert.equal(rows[0].title,'Уютная; квартира');assert.equal(rows[0].description,'Строка 1\nСтрока "два"');assert.equal(rows[0].externalId,'=1+1');
 assert.equal(parsePropertyCSV('title,city\n"A, B",Pavlodar')[0].title,'A, B');assert.throws(()=>parsePropertyCSV('title;city\n"open;city'),/не закрыто/);assert.throws(()=>parsePropertyCSV('title;title\nA;B'),/повторяющиеся/);assert.throws(()=>parsePropertyCSV('title;city\nA;B;C'),/число полей/);
 assert.throws(()=>parsePropertyCSV('title;city\n"" "A";B'),/кавычки/);assert.throws(()=>parsePropertyCSV('constructor;city\nA;B'),/неизвестные/);
});
test('preview is private, stores validation errors and creates no properties',async()=>{
 const f=await fixture();try{
  const before=f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n;const p=(await previewPropertyImport(f.owner,request([apartment(),{...apartment(2),price:-1},{...apartment(3),ownerId:'other'}]))).preview;
  assert.deepEqual(p.rows.map(r=>r.status),['ready','invalid','invalid']);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n,before);assert.equal((await previewPropertyImport(f.owner,{id:p.id})).preview.payloadHash,p.payloadHash);
  await assert.rejects(previewPropertyImport(f.other,{id:p.id}),e=>e.status===403);await assert.rejects(previewPropertyImport(f.guest,request([apartment()])),e=>e.status===403);assert.equal((await importState(f.other)).previews.length,0);
 }finally{f.db.close();}
});
test('confirmed import is atomic, publishes nothing and concurrent replay returns one result',async()=>{
 const f=await fixture();try{
  const before=f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n,p=(await previewPropertyImport(f.owner,request([apartment(),apartment(2)]))).preview,body=confirm(p);
  await assert.rejects(commitPropertyImport(f.owner,{...body,confirmed:false}));await assert.rejects(commitPropertyImport(f.other,body),e=>e.status===403);
  const [a,b]=await Promise.all([commitPropertyImport(f.owner,body),commitPropertyImport(f.owner,body)]);assert.deepEqual(a.propertyIds,b.propertyIds);assert.equal(a.propertyIds.length,2);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n,before+2);
  for(const key of a.propertyIds){const property=f.db.raw.prepare('SELECT * FROM properties WHERE id=?').get(key),policy=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(key),op=f.db.raw.prepare('SELECT * FROM property_operations WHERE property_id=?').get(key);assert.equal(property.published,0);assert.equal(property.owner_id,'owner');assert.equal(policy.auto_confirm,0);assert.equal(op.readiness,'inspection');}
  f.db.raw.prepare('UPDATE property_imports SET expires_at=0 WHERE id=?').run(p.id);assert.deepEqual((await commitPropertyImport(f.owner,body)).propertyIds,a.propertyIds);await assert.rejects(commitPropertyImport(f.owner,{...body,rowNumbers:[1]}),e=>e.status===409);
 }finally{f.db.close();}
});
test('duplicate matching stays within owner and uses source IDs and normalised addresses',async()=>{
 const f=await fixture();try{
  const p=(await previewPropertyImport(f.owner,request([apartment(),{...apartment(2),address:'СВОЙ   АДРЕС 1'},{...apartment(3),externalId:'external-1'}]))).preview;assert.deepEqual(p.rows.map(r=>r.status),['ready','duplicate','duplicate']);await commitPropertyImport(f.owner,confirm(p));
  const again=(await previewPropertyImport(f.owner,request([{...apartment(),address:'Moved address'}, {...apartment(4),address:' свой адрес 1. '},{...apartment(5),address:'PRIVATE ADDRESS'}]))).preview;assert.deepEqual(again.rows.map(r=>r.status),['duplicate','duplicate','duplicate']);
  const other=(await previewPropertyImport(f.other,request([apartment()]))).preview;assert.equal(other.rows[0].status,'ready');assert.equal(other.rows[0].duplicateId,undefined);
 }finally{f.db.close();}
});
test('expired, stale, overlarge or changed imports cannot create a partially applied batch',async()=>{
 const f=await fixture();try{
  await assert.rejects(previewPropertyImport(f.owner,request(Array.from({length:26},(_,i)=>apartment(i)))));await assert.rejects(previewPropertyImport(f.owner,{...request([]),content:'a'.repeat(280001)}));
  const p=(await previewPropertyImport(f.owner,request([apartment(),apartment(2)]))).preview,body=confirm(p);await assert.rejects(commitPropertyImport(f.owner,{...body,payloadHash:'changed'}),e=>e.status===409);
  f.db.raw.prepare('UPDATE property_imports SET expires_at=? WHERE id=?').run(now()-1,p.id);await assert.rejects(commitPropertyImport(f.owner,body),e=>e.status===409);
  const next=(await previewPropertyImport(f.owner,request([apartment(),apartment(2)]))).preview;await f.owner.createProperty(apartment());const before=f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n;await assert.rejects(commitPropertyImport(f.owner,confirm(next)),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n,before);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_import_links').get().n,0);
 }finally{f.db.close();}
});
test('photos are existing own media only; foreign photo IDs and remote URLs are rejected',async()=>{
 const f=await fixture();try{
  const own=await f.owner.uploadMedia({kind:'property',data:photo}),foreign=await f.other.uploadMedia({kind:'property',data:photo});const p=(await previewPropertyImport(f.owner,request([{...apartment(),photos:[own.id]},{...apartment(2),photos:[foreign.id]},{...apartment(3),photos:['https://example.test/image.jpg']}]))).preview;assert.deepEqual(p.rows.map(r=>r.status),['ready','invalid','invalid']);const result=await commitPropertyImport(f.owner,confirm(p));assert.deepEqual(JSON.parse(f.db.raw.prepare('SELECT photos FROM property_details WHERE property_id=?').get(result.propertyIds[0]).photos),[own.id]);
 }finally{f.db.close();}
});

test('a full 25-row import uses bounded batched SQL with no statement over 100 parameters',async()=>{
 const f=await fixture();try{
  const p=(await previewPropertyImport(f.owner,request(Array.from({length:25},(_,i)=>apartment(i))))).preview,prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);let batchSize=0;
  f.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind;statement.bind=(...args)=>{assert.ok(args.length<=100,'D1 SQL parameter cap');return bind.apply(statement,args);};return statement;};f.db.batch=statements=>{batchSize=statements.length;return batch(statements);};
  const result=await commitPropertyImport(f.owner,confirm(p));assert.equal(result.propertyIds.length,25);assert.ok(batchSize<25);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_import_links').get().n,25);
 }finally{f.db.close();}
});

test('changing an existing address between validation and commit prevents duplicate creation atomically',async()=>{
 const f=await fixture();try{
  const p=(await previewPropertyImport(f.owner,request([apartment()]))).preview,batch=f.db.batch.bind(f.db);f.db.batch=statements=>{f.db.raw.prepare('UPDATE properties SET address=? WHERE id=?').run(apartment().address,f.property);return batch(statements);};
  await assert.rejects(commitPropertyImport(f.owner,confirm(p)),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties').get().n,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_import_links').get().n,0);assert.equal(f.db.raw.prepare('SELECT status FROM property_imports WHERE id=?').get(p.id).status,'prepared');
 }finally{f.db.close();}
});

test('JSON IDs and numeric fields reject structural coercion while formula-like text stays inert',async()=>{
 const f=await fixture();try{
  const values=[{externalId:{nested:'id'}},{externalId:'with\u0000control'},{externalId:9007199254740992},{rooms:[1]},{capacity:true},{photos:false},{externalId:123},{externalId:'=HYPERLINK("https://example.test")'}].map((extra,i)=>({...apartment(i),...extra}));
  const p=(await previewPropertyImport(f.owner,request(values))).preview;assert.deepEqual(p.rows.map(r=>r.status),['invalid','invalid','invalid','invalid','invalid','invalid','ready','ready']);assert.equal(p.rows[6].value.externalId,'123');assert.equal(p.rows[7].value.externalId,values[7].externalId);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_import_links').get().n,0);
 }finally{f.db.close();}
});

test('concurrent preview requests cannot bypass the persistent five-per-minute limit',async()=>{
 const f=await fixture();try{
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>previewPropertyImport(f.owner,request([apartment(i)]))));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected.reason.status,429);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM property_imports').get().n,5);
 }finally{f.db.close();}
});
