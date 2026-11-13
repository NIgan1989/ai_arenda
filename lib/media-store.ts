import {q,one,rows,type Row} from './operation-core';

// Flat photos live in R2 when the BUCKET binding exists, so the database keeps only a pointer.
// Without the binding (local runs, before the bucket is set up) the photo stays in D1 as before.
// Avatars stay in D1: they are small and read inside chat queries.
export const MEDIA_PREFIX='media/';
export const mediaKey=(id:string)=>MEDIA_PREFIX+id+'.jpg';

export function dataUrlBytes(dataUrl:string){const binary=atob(dataUrl.slice(dataUrl.indexOf(',')+1));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
export function bytesDataUrl(bytes:Uint8Array,mime='image/jpeg'){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return 'data:'+mime+';base64,'+btoa(binary);}

// Returns the photo as the data URL that clients already expect.
export async function mediaData(row:Row,bucket?:R2Bucket):Promise<string>{
 if(!row.object_key)return row.data;
 const object=await bucket?.get(row.object_key);
 if(!object)throw new Error('media_object_missing');
 return bytesDataUrl(new Uint8Array(await object.arrayBuffer()));
}

// Moves flat photos that are still in D1 into R2, a few per pass. The row keeps its data until
// the object is written, and the swap only happens if the row is unchanged.
export async function moveMediaToBucket(db:D1Database,bucket:R2Bucket|undefined,limit=20){
 if(!bucket)return {configured:false,moved:0};
 const pending=await rows(db,"SELECT id,data FROM media WHERE kind='property' AND object_key='' AND data<>'' ORDER BY created_at,id LIMIT ?",limit);let moved=0;
 for(const m of pending){
  const key=mediaKey(m.id);await bucket.put(key,dataUrlBytes(m.data),{httpMetadata:{contentType:'image/jpeg'}});
  const r=await q(db,"UPDATE media SET object_key=?,data='' WHERE id=? AND object_key='' AND data=?",key,m.id,m.data).run();
  if(r.meta.changes)moved++;else if(!await one(db,'SELECT id FROM media WHERE object_key=?',key))await bucket.delete(key);
 }
 return {configured:true,moved,remaining:pending.length===limit};
}

// Removes stored photos whose row is gone (deleted listing photo, erased account). Walks the
// bucket in pages and keeps its place in the job payload.
export async function sweepMediaObjects(db:D1Database,bucket:R2Bucket|undefined,cursor=''){
 if(!bucket)return {configured:false,cursor:''};
 const listed=await bucket.list({prefix:MEDIA_PREFIX,limit:90,...(cursor?{cursor}:{})});
 const keys=listed.objects.map(o=>o.key);let removed=0;
 if(keys.length){
  const known=new Set((await rows(db,`SELECT object_key FROM media WHERE object_key IN (${keys.map(()=>'?').join(',')})`,...keys)).map(r=>r.object_key));
  // A photo is written to R2 a moment before its row; leave fresh objects alone.
  const stale=listed.objects.filter(o=>!known.has(o.key)&&Date.now()-o.uploaded.getTime()>3600000).map(o=>o.key);
  if(stale.length){await bucket.delete(stale);removed=stale.length;}
 }
 return {configured:true,removed,cursor:listed.truncated?listed.cursor:''};
}
