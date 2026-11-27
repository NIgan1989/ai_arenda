// «Заголовок» in one format (lib/listing-title.ts) for the listings saved before it, once (2026-11-27).
// Input: a JSON array of rows {id,title,type,rooms,district,city} (SELECT below, e.g. from the D1 console);
// output: the UPDATE statements for the titles that change, and the old titles beside them to undo it.
//   SELECT p.id,p.title,json_extract(d.details,'$.type') type,p.rooms,p.district,p.city FROM properties p
//   JOIN property_details d ON d.property_id=p.id WHERE p.archived_at IS NULL
//   AND COALESCE(json_extract(d.details,'$.type'),'')<>'home' AND p.id NOT IN (SELECT property_id FROM venue_halls)
// Usage: node scripts/listing-titles.mjs rows.json > titles.sql   (undo: the «-- was» lines)
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const src=readFileSync(new URL('../lib/listing-title.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {formatTitle}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const rows=JSON.parse(readFileSync(process.argv[2]||0,'utf8'));
const lit=v=>"'"+String(v).replace(/'/g,"''")+"'";
let changed=0;
for(const r of rows){
 const next=formatTitle(r.title,r.type||'apartment',Number(r.rooms)||1,{district:r.district,city:r.city});
 if(next===r.title)continue;changed++;
 console.log(`-- was ${lit(r.title)}`);
 console.log(`UPDATE properties SET title=${lit(next)} WHERE id=${lit(r.id)} AND title=${lit(r.title)};`);
}
console.error(changed+' of '+rows.length+' titles change');
