import jpeg from 'jpeg-js';
import {epoch,q,rows} from './operation-core';
import {dataUrlBytes} from './media-store';
import {sweepTwins} from './photo-print';
const W=9,H=8;

// The print of each photo of a home (lib/photo-print.ts), made in the background a few photos at a time: a new photo
// gets it within minutes, the photos uploaded before the prints existed get it the same way.
/** The print of a JPEG as 16 hex digits, or '' when the photo cannot be read or is one flat colour. */
export function photoPrint(bytes:Uint8Array):string{
 let image:{width:number;height:number;data:Uint8Array};
 try{image=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,maxResolutionInMP:4,maxMemoryUsageInMB:64}) as typeof image;}catch{return '';}
 const {width,height,data}=image;if(!width||!height)return '';
 // The average brightness of each of the 9×8 cells.
 const sum=new Float64Array(W*H),count=new Uint32Array(W*H);
 for(let y=0;y<height;y++){const cy=Math.min(H-1,Math.floor(y*H/height));
  for(let x=0;x<width;x++){const cx=Math.min(W-1,Math.floor(x*W/width)),i=(y*width+x)*3;
   sum[cy*W+cx]+=data[i]*.299+data[i+1]*.587+data[i+2]*.114;count[cy*W+cx]++;}}
 const grey=Array.from(sum,(v,i)=>count[i]?v/count[i]:0);
 let bits='',ones=0;
 for(let y=0;y<H;y++)for(let x=0;x<W-1;x++){const on=grey[y*W+x]>grey[y*W+x+1];bits+=on?'1':'0';if(on)ones++;}
 // A blank or nearly blank picture has almost no bits set (or all of them): it would match every other blank one.
 if(ones<4||ones>60)return '';
 let hex='';for(let i=0;i<64;i+=4)hex+=parseInt(bits.slice(i,i+4),2).toString(16);
 return hex;
}
/** Stores the print of a freshly uploaded photo of a home. A photo that cannot be read keeps an empty print. */
export async function savePrint(db:D1Database,mediaId:string,bytes:Uint8Array){
 await q(db,'INSERT OR IGNORE INTO media_prints(media_id,print,created_at) VALUES (?,?,?)',mediaId,photoPrint(bytes),epoch()).run();
}

export async function sweepPrints(db:D1Database,bucket:R2Bucket|undefined,admins:string[],limit=12){
 const missing=await rows(db,"SELECT m.id,m.data,m.object_key FROM media m WHERE m.kind='property' AND NOT EXISTS(SELECT 1 FROM media_prints x WHERE x.media_id=m.id) ORDER BY m.created_at DESC LIMIT ?",limit);
 let printed=0;
 for(const m of missing){
  let bytes:Uint8Array|null=null;
  try{bytes=m.object_key?new Uint8Array(await (await bucket?.get(m.object_key))?.arrayBuffer()??new ArrayBuffer(0)):m.data?dataUrlBytes(m.data):null;}catch{bytes=null;}
  // A photo in the bucket that cannot be fetched now is tried again next time.
  if(m.object_key&&!bytes?.length)continue;
  await savePrint(db,m.id,bytes??new Uint8Array(0));printed++;
 }
 return {printed,...await sweepTwins(db,admins)};
}
