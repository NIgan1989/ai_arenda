import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {suggestClass,classOfRow}=await load('stay-class');
const {matchingInput,rankMatches,previewMatches}=await load('smart-matching');
const {guessStayClass,setStayClass,adminClassList,adminSetClass}=await load('stay-class-db');

// Классы жилья (2026-11-26): the AI suggests, the owner confirms or changes, an administrator may correct, the guest filters.
test('the rules suggest the class from the renovation, the space per guest and the amenities, and say why',()=>{
 const usual=['wifi','kitchen','tv','linen'];
 assert.equal(suggestClass({type:'apartment',area:40,capacity:3,amenities:usual,text:'Однушка в центре'}).stayClass,'standard');
 const fresh=suggestClass({type:'apartment',area:60,capacity:2,amenities:[...usual,'aircon','washer','parking','elevator','towels'],text:'Евроремонт, новостройка'});
 assert.equal(fresh.stayClass,'premium');assert.ok(fresh.reasons.some(r=>/ремонт/.test(r)));assert.ok(fresh.reasons.length<=3);
 assert.equal(suggestClass({type:'apartment',area:20,capacity:4,amenities:['wifi'],text:'Старый ремонт, скромно'}).stayClass,'economy');
 // A hostel bed is never more than «Стандарт», however it is described.
 assert.equal(suggestClass({type:'hostel',area:200,capacity:4,amenities:[...usual,'aircon','washer','parking','elevator','towels','jacuzzi'],text:'дизайнерский'}).stayClass,'standard');
 // The photos, when the model looked at them, weigh instead of the words.
 const seen=suggestClass({type:'apartment',area:40,capacity:3,amenities:usual,text:'дизайнерский ремонт',photos:'old'});
 assert.equal(seen.stayClass,'economy');assert.equal(seen.from,'photos');
 // A bath or a hall has no class; a class set for a place stays over the rules' estimate.
 assert.equal(classOfRow({capacity:4},{type:'banya'}),null);
 assert.equal(classOfRow({capacity:4,stay_class:'premium',description:'старый ремонт'},{type:'apartment',area:10}),'premium');
});

test('the owner sets the class of his place, an administrator corrects it and then the owner cannot overrule it',async()=>{
 const f=await fixture();try{
  // Without a model the guess is the rules' one, and a bath gets none.
  assert.equal((await guessStayClass(f.owner,{type:'apartment',area:70,capacity:2,amenities:['wifi','aircon','washer','parking','elevator','towels','tv'],text:'евроремонт',photos:['x']})).from,'rules');
  assert.equal((await guessStayClass(f.owner,{type:'sauna'})).stayClass,null);
  assert.deepEqual(await setStayClass(f.owner,{propertyId:f.property,stayClass:'comfort',by:'ai'}),{stayClass:'comfort',by:'ai'});
  await assert.rejects(setStayClass(f.owner,{propertyId:f.property,stayClass:'luxury'}),/класс/i);
  await assert.rejects(setStayClass(f.other,{propertyId:f.property,stayClass:'economy'}),e=>e.status===404);
  await setStayClass(f.owner,{propertyId:f.property,stayClass:'standard'});
  assert.deepEqual({...f.db.raw.prepare('SELECT stay_class,stay_class_by FROM properties WHERE id=?').get(f.property)},{stay_class:'standard',stay_class_by:'owner'});
  await adminSetClass(f.other,{propertyId:f.property,stayClass:'economy'});
  await assert.rejects(setStayClass(f.owner,{propertyId:f.property,stayClass:'premium'}),e=>e.status===409);
  const list=await adminClassList(f.other,{city:'Павлодар'});
  assert.deepEqual(list.items.find(p=>p.id===f.property)&&{c:list.items.find(p=>p.id===f.property).stayClass,by:list.items.find(p=>p.id===f.property).by},{c:'economy',by:'admin'});
  const audit=f.db.raw.prepare("SELECT action FROM audit_events WHERE entity_id=? AND action LIKE '%property.class%'").all(f.property);
  assert.equal(audit.length,3);
 }finally{f.db.close();}
});

test('the guest searches by class: only the classes asked for, and an empty answer names the class',async()=>{
 const base=now(),input={city:'Павлодар',start:iso(base+86400),end:iso(base+172800),guests:'2',mode:'daily',maxPrice:'11000',priority:'balanced',features:[]};
 assert.throws(()=>matchingInput({...input,classes:['luxury']}));
 assert.equal(matchingInput(input).classes,undefined);
 const f=matchingInput({...input,classes:['comfort','premium']}),home=(id,c)=>({id,district:'Центр',stay_class:c,estimate:{amount:10000},details:{amenities:[]},display_status:{code:'ready'}});
 assert.deepEqual(rankMatches([home('a','economy'),home('b','comfort'),home('c','premium')],f).map(p=>p.id).sort(),['b','c']);
 const db=await fixture();try{
  db.db.raw.prepare("UPDATE properties SET stay_class='economy',stay_class_by='owner' WHERE id=?").run(db.property);
  const found=await previewMatches(db.guest,input);assert.equal(found.properties[0].stay_class,'economy');
  const none=await previewMatches(db.guest,{...input,classes:['premium']});
  assert.equal(none.properties.length,0);assert.equal(none.empty.blocker,'classes');
 }finally{db.db.close();}
});
