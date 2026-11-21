import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
import {buildAddressBook} from '../scripts/build-address-book.mjs';
const {suggestPlaces,suggestAddress,suggestDistricts,canonicalCity,bookSpot,findPlace}=await load('address-book');
const {splitAddress,nameTokens,shortStreet,houseNumber}=await load('address-text');
const {withCanonicalCity,addressRequest}=await load('address-api');

const f=(id,properties,geometry)=>JSON.stringify({type:'Feature',id,properties,geometry});
const pt=(x,y)=>({type:'Point',coordinates:[x,y]});
const lines=[
 f('n1',{place:'city',name:'Павлодар',population:'360000'},pt(76.95,52.287)),
 f('n2',{place:'village',name:'Жанаталап'},pt(77.2,52.1)),
 f('n22',{place:'village',name:'Жанаталап'},pt(70.1,43.1)),
 f('n3',{place:'city',name:'Өскемен','name:ru':'Усть-Каменогорск',population:'330000'},pt(82.61,49.95)),
 f('n4',{place:'hamlet',name:'Павловка'},pt(76.5,52.5)),
 f('r5',{boundary:'administrative',admin_level:'4',name:'Павлодар облысы','name:ru':'Павлодарская область'},{type:'Polygon',coordinates:[[[75,51],[79,51],[79,54],[75,54],[75,51]]]}),
 f('r6',{boundary:'administrative',admin_level:'4',name:'Түркістан облысы','name:ru':'Туркестанская область'},{type:'Polygon',coordinates:[[[68,42],[72,42],[72,45],[68,45],[68,42]]]}),
 f('w7',{highway:'residential',name:'улица Торайгырова','name:kk':'Торайғыров көшесі'},{type:'LineString',coordinates:[[76.94,52.28],[76.95,52.285],[76.96,52.29]]}),
 f('w8',{building:'yes','addr:street':'улица Торайгырова','addr:housenumber':'64'},{type:'Polygon',coordinates:[[[76.951,52.286],[76.952,52.286],[76.952,52.287],[76.951,52.286]]]}),
 f('n9',{'addr:street':'Торайғыров көшесі','addr:housenumber':'6'},pt(76.945,52.283)),
 f('n10',{'addr:street':'улица Торайгырова','addr:housenumber':'60 а'},pt(76.947,52.284)),
 f('w11',{highway:'tertiary',name:'улица Академика Сатпаева'},{type:'LineString',coordinates:[[76.96,52.27],[76.97,52.275]]}),
 f('n12',{place:'neighbourhood',name:'Центр'},pt(76.95,52.286)),
 f('n13',{'addr:street':'Абая','addr:housenumber':'5','addr:city':'Жанаталап'},pt(77.201,52.101)),
 f('w14',{highway:'residential',name:'микрорайон Самал-2'},{type:'LineString',coordinates:[[82.6,49.94],[82.61,49.945]]}),
];
async function* stream(){for(const l of lines)yield l;}
const {files}=await buildAddressBook(stream(),{version:'t1'});
const store=new Map([['geo/kz/current.json',JSON.stringify({version:'t1'})],...[...files].map(([k,v])=>['geo/kz/t1/'+k,v])]);
const bucket={get:async k=>store.has(k)?{text:async()=>store.get(k)}:null};

test('address words are read the same however they are typed', () => {
 assert.deepEqual(nameTokens('ул. Торайгырова'),['тораигырова']);
 assert.deepEqual(nameTokens('Торайғыров көшесі'),['тораигыров']);
 assert.deepEqual(nameTokens('мкр 5'),['5']);
 assert.equal(shortStreet('улица Абая'),'ул. Абая');
 assert.equal(houseNumber('12 а'),'12А');
 assert.deepEqual(splitAddress('Торайгырова 64 кв 12'),{street:'Торайгырова',house:'64',flat:'12'});
 assert.deepEqual(splitAddress('мкр Самал-2, 15'),{street:'мкр Самал-2',house:'15',flat:''});
 assert.deepEqual(splitAddress('мкр 5'),{street:'мкр 5',house:'',flat:''});
});

test('cities come by the start of the name, by Kazakh name and with a typo', async () => {
 const pav=await suggestPlaces(bucket,undefined,'пав');
 assert.deepEqual(pav.map(p=>p.name),['Павлодар','Павловка']);
 assert.equal(pav[0].region,'Павлодарская область');
 assert.equal((await suggestPlaces(bucket,undefined,'Өскемен'))[0].name,'Усть-Каменогорск');
 assert.equal((await suggestPlaces(bucket,undefined,'павладар'))[0].name,'Павлодар');
 assert.equal((await suggestPlaces(bucket,undefined,'pavlodar'))[0].name,'Павлодар');
 const twins=await suggestPlaces(bucket,undefined,'жанаталап');
 assert.deepEqual(twins.map(p=>p.region),['Павлодарская область','Туркестанская область']);
 assert.equal((await suggestPlaces(bucket,undefined,'')).length,2,'an empty field shows the largest cities');
});

test('a city the owner typed is saved under its right name, an unknown one stays as typed', async () => {
 assert.equal((await withCanonicalCity(bucket,{city:'павлодар '})).city,'Павлодар');
 assert.equal((await withCanonicalCity(bucket,{city:'Павладар'})).city,'Павлодар');
 assert.equal((await withCanonicalCity(bucket,{city:'Өскемен'})).city,'Усть-Каменогорск');
 assert.equal((await withCanonicalCity(bucket,{city:'Пав'})).city,'Пав','a part of a name is not guessed');
 assert.equal((await withCanonicalCity(bucket,{city:'Новоселовка'})).city,'Новоселовка');
 assert.equal((await withCanonicalCity(undefined,{city:'павлодар'})).city,'павлодар','without the book nothing changes');
 assert.equal((await findPlace(bucket,'Жанаталап','n22')).r,'Туркестанская область','the id from the list chooses between namesakes');
 assert.equal((await canonicalCity(bucket,'Нет такого')),null);
});

test('streets, then houses with their point and district', async () => {
 const streets=await suggestAddress(bucket,'Павлодар','торайг');
 assert.equal(streets[0].label,'ул. Торайгырова');
 assert.equal(streets[0].houses,3);
 assert.equal((await suggestAddress(bucket,'Павлодар','Торайғыров'))[0].label,'ул. Торайгырова');
 assert.equal((await suggestAddress(bucket,'Павлодар','сатп'))[0].label,'ул. Академика Сатпаева');
 const houses=await suggestAddress(bucket,'Павлодар','Торайгырова 6');
 assert.deepEqual(houses.map(h=>h.house),['6','60А','64']);
 assert.equal(houses[0].value,'ул. Торайгырова, 6');
 assert.equal(houses[0].district,'Центр');
 assert.ok(Math.abs(houses[0].point[0]-76.945)<1e-4&&Math.abs(houses[0].point[1]-52.283)<1e-4);
 const flat=await suggestAddress(bucket,'Павлодар','Торайгырова 64 кв 7');
 assert.equal(flat[0].value,'ул. Торайгырова, 64, кв. 7');
 const unknownHouse=await suggestAddress(bucket,'Павлодар','Торайгырова 99');
 assert.deepEqual(unknownHouse.map(h=>[h.kind,h.value]),[['street','ул. Торайгырова, 99']],'a house missing from the book can still be written');
 assert.equal((await suggestAddress(bucket,'Жанаталап','абая 5','n2'))[0].house,'5');
 assert.equal((await suggestAddress(bucket,'Усть-Каменогорск','самал'))[0].label,'мкр Самал-2');
});

test('districts of a city, and the pin from the book', async () => {
 assert.deepEqual(await suggestDistricts(bucket,undefined,'Павлодар','це'),['Центр']);
 const spot=await bookSpot(bucket,'Павлодар','ул. Торайгырова, 64, кв. 7');
 assert.equal(spot.exact,true);
 const street=await bookSpot(bucket,'Павлодар','Торайгырова 99');
 assert.equal(street.exact,false);
 assert.equal(await bookSpot(bucket,'Жанаталап','Абая 5'),null,'namesake villages: no pin without the one the owner picked');
 assert.equal((await bookSpot(bucket,'Жанаталап','Абая 5','n2')).exact,true);
 assert.equal((await bookSpot(bucket,'Жанаталап','','n2')).longitude,77.2);
 assert.equal((await bookSpot(bucket,'Павлодар','Торай 64')).exact,false,'a part of a street name is no exact house');
 assert.equal((await bookSpot(bucket,'Павлодар','Сатпаева 3')).exact,false);
});

test('the public route answers without the book with empty lists', async () => {
 assert.deepEqual(await addressRequest(undefined,undefined,new URLSearchParams('kind=street&city=Павлодар&q=торайг')),{items:[]});
 assert.equal((await addressRequest(bucket,undefined,new URLSearchParams('kind=city&q=пав'))).items[0].name,'Павлодар');
});

test('a file left from an older book in the same place is never read', async () => {
 const meta=JSON.parse(files.get('meta.json'));
 const old=new Map(store);old.set('geo/kz/current.json',JSON.stringify({version:'t1',pk:meta.pk.filter(k=>k!==[...'па'].map(c=>c.codePointAt(0).toString(36)).join('-'))}));
 const stale={get:async k=>old.has(k)?{text:async()=>old.get(k)}:null};
 assert.equal((await suggestPlaces(stale,undefined,'пав')).length,0);
});

test('the upload stops when it cannot tell which book is in use, and starts a first book only on «not found»', async () => {
 const {uploadAddressBook}=await import('../scripts/upload-address-book.mjs');
 const {mkdtempSync,writeFileSync:write,mkdirSync:mk}=await import('node:fs');const {join:j}=await import('node:path');const {tmpdir}=await import('node:os');
 const dir=mkdtempSync(j(tmpdir(),'book-'));for(const [k,v] of files){mk(j(dir,k,'..'),{recursive:true});write(j(dir,k),v);}
 const run=(answer)=>{const puts=[];return uploadAddressBook({dir,token:'t',account:'x',log:()=>{},perSecond:1e6,wait:async()=>{},fetcher:async(u,o={})=>{if(!o.method)return answer();puts.push(decodeURIComponent(String(u).split('/objects/')[1]));return new Response('{}');}}).then(r=>({r,puts}));};
 await assert.rejects(run(()=>new Response('busy',{status:503})));
 const first=await run(()=>new Response('{}',{status:404}));
 assert.equal(first.r.slot,'a');assert.equal(first.puts.at(-1),'geo/kz/current.json');
 const second=await run(()=>Response.json({version:'a'}));
 assert.equal(second.r.slot,'b');assert.ok(second.puts.every(p=>p.startsWith('geo/kz/b/')||p==='geo/kz/current.json'));
});
