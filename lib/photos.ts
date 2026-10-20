import {DomainError} from './domain';
export const MAX_PHOTOS=8;
export const MAX_PHOTO_BYTES=500*1024;
export function validatePhoto(bytes:Uint8Array,type:string){
 if(bytes.length>MAX_PHOTO_BYTES)throw new DomainError('Фото должно быть не больше 500 КБ.',413);
 const png=type==='image/png'&&bytes.length>=33&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const jpeg=type==='image/jpeg'&&bytes.length>=128&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
 if(!png&&!jpeg)throw new DomainError('Выберите фотографию JPEG или PNG.');
 let width=0,height=0;
 if(png){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);width=view.getUint32(16);height=view.getUint32(20);}
 else {let offset=2;while(offset+4<bytes.length){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===0xda||marker===0xd9)break;const length=(bytes[offset]<<8)|bytes[offset+1];if(length<2||offset+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8){height=(bytes[offset+3]<<8)|bytes[offset+4];width=(bytes[offset+5]<<8)|bytes[offset+6];break;}offset+=length;}}
 if(!width||!height||width>4096||height>4096)throw new DomainError('Размер фотографии должен быть не больше 4096 пикселей по стороне.');
}
export async function readPhoto(request:Request){
 const type=(request.headers.get('content-type')||'').split(';')[0];
 if(!['image/jpeg','image/png'].includes(type))throw new DomainError('Поддерживаются JPEG и PNG.',415);
 if(Number(request.headers.get('content-length')||0)>MAX_PHOTO_BYTES)throw new DomainError('Фото слишком большое.',413);
 const reader=request.body?.getReader();if(!reader)throw new DomainError('Файл не получен.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_PHOTO_BYTES){await reader.cancel();throw new DomainError('Фото слишком большое.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}validatePhoto(bytes,type);return {bytes,type};
}
export async function storePhoto(db:D1Database,userId:string,bytes:Uint8Array,type:string){
 validatePhoto(bytes,type);
 const role=await db.prepare('SELECT roles FROM profiles WHERE id=?').bind(userId).first<{roles:string}>();
 if(!role||!JSON.parse(role.roles).includes('owner'))throw new DomainError('Добавлять фото может владелец.',403);
 const pending=await db.prepare('SELECT count(*) count FROM property_photos WHERE owner_id=? AND property_id IS NULL').bind(userId).first<{count:number}>();
 if((pending?.count||0)>=24)throw new DomainError('Слишком много фото в черновиках. Сохраните объекты или удалите ненужные фотографии.',409);
 const id=crypto.randomUUID();await db.prepare('INSERT INTO property_photos(id,owner_id,content_type,data,created_at) VALUES (?,?,?,?,?)').bind(id,userId,type,bytes.buffer,Math.floor(Date.now()/1000)).run();return {id,url:'/api/photos/'+id};
}
export async function fetchPhoto(db:D1Database,userId:string,photoId:string){
 const photo=await db.prepare(`SELECT f.content_type,f.data FROM property_photos f LEFT JOIN properties p ON p.id=f.property_id WHERE f.id=? AND (f.owner_id=? OR (p.published=1 AND (p.demo_owner IS NULL OR p.demo_owner=?)) OR EXISTS(SELECT 1 FROM bookings b WHERE b.property_id=p.id AND b.guest_id=? AND b.status='confirmed') OR EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.property_id=p.id AND j.assigned_to=? AND j.status IN ('assigned','in_progress','submitted')))`).bind(photoId,userId,userId,userId,userId).first<{content_type:string;data:ArrayBuffer|number[]}>();
 if(!photo)throw new DomainError('Фото не найдено.',404);
 return new Response(Array.isArray(photo.data)?new Uint8Array(photo.data):photo.data,{headers:{'Content-Type':photo.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
