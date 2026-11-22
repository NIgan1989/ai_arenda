import {q,rows} from './operation-core';

// Private photos that are deleted after a person at the platform checked them: the ID cards (lib/identity-docs.ts,
// identity/) and the documents of the right to let a place (lib/property-rights.ts, property-rights/).
// Storage deletes can fail. A checked photo keeps its pointer until the storage confirmed the delete, and the hourly
// sweep tries again; a stored photo that no row waits for (refused, removed, replaced) is found by listing the bucket.
export type PrivateTable='identity_docs'|'property_right_docs';
export const PRIVATE_PHOTOS:{table:PrivateTable;prefix:string}[]=[{table:'identity_docs',prefix:'identity/'},{table:'property_right_docs',prefix:'property-rights/'}];

// Deletes stored photos one by one. A checked photo loses its pointer only when its delete succeeded.
// Returns how many are still in the storage.
export async function dropPrivatePhotos(db:D1Database,bucket:R2Bucket|undefined,table:PrivateTable,keys:string[]){
 let left=0;
 for(const key of keys){
  if(!bucket){left++;continue;}
  try{await bucket.delete(key);await q(db,`UPDATE ${table} SET object_key='' WHERE object_key=? AND checked_at IS NOT NULL`,key).run();}
  catch{left++;console.error('Private photo delete failed; the sweep will retry');}
 }
 return left;
}

// Hourly: (1) photos of checked rows whose delete failed are deleted again; (2) stored photos that no unchecked row
// waits for are deleted. A photo is written a moment before its row, so an object younger than an hour without a row
// is left alone. Walks the bucket in pages and keeps its place, like the flat photos (lib/media-store.ts).
export async function sweepPrivatePhotos(db:D1Database,bucket:R2Bucket|undefined,table:PrivateTable,prefix:string,cursor=''){
 if(!bucket)return {configured:false,cursor:'',removed:0,left:0};
 const stuck=(await rows(db,`SELECT object_key FROM ${table} WHERE checked_at IS NOT NULL AND object_key<>'' LIMIT 50`)).map(r=>String(r.object_key));
 let left=await dropPrivatePhotos(db,bucket,table,stuck),removed=stuck.length-left;
 const listed=await bucket.list({prefix,limit:90,...(cursor?{cursor}:{})}),keys=listed.objects.map(o=>o.key);
 if(keys.length){
  const marks=keys.map(()=>'?').join(',');
  const waiting=new Set((await rows(db,`SELECT object_key FROM ${table} WHERE checked_at IS NULL AND object_key IN (${marks})`,...keys)).map(r=>String(r.object_key)));
  const checked=new Set((await rows(db,`SELECT object_key FROM ${table} WHERE checked_at IS NOT NULL AND object_key IN (${marks})`,...keys)).map(r=>String(r.object_key)));
  const gone=listed.objects.filter(o=>!waiting.has(o.key)&&!stuck.includes(o.key)&&(checked.has(o.key)||Date.now()-o.uploaded.getTime()>3600000)).map(o=>o.key);
  const l=await dropPrivatePhotos(db,bucket,table,gone);left+=l;removed+=gone.length-l;
 }
 return {configured:true,removed,left,cursor:listed.truncated?listed.cursor:''};
}
