'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {avatarInitials} from '../lib/avatar';
import {Image as ImageIcon,UserRound,Upload} from 'lucide-react';
type API=(path:string,body?:Record<string,any>)=>Promise<any>;
export function Photo({id,role,alt,avatar=false,publicView=false,name,fallback,rejectTiny=false}:{id?:string|null;role:string;alt:string;avatar?:boolean;publicView?:boolean;name?:string;fallback?:ReactNode;rejectTiny?:boolean}){
 const [uri,setUri]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;setUri('');setFailed(false);if(id)fetch((publicView?'/api/public/media/':'/api/media/')+encodeURIComponent(id),{headers:publicView?{}:{'X-Workspace-Role':role},cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json() as Promise<{data:string}>;}).then(r=>{if(live)setUri(r.data);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[id,role,publicView]);
 return uri&&!failed?<img className={avatar?'profile-photo':'listing-photo'} src={uri} alt={alt} onLoad={e=>{if(rejectTiny&&(e.currentTarget.naturalWidth<16||e.currentTarget.naturalHeight<16))setFailed(true);}} onError={()=>setFailed(true)}/>:<span className={avatar?'profile-photo photo-placeholder':'listing-photo photo-placeholder'} data-state={failed?'failed':id?'loading':'empty'} role="img" aria-label={alt}>{fallback|| (avatar?<span className="avatar-initials">{avatarInitials(name||alt.replace(/^Аватар: |^Фото: /,''))}</span>:<><ImageIcon size={30}/><small>{failed?'Фото недоступно':'Фотографии ещё не добавлены'}</small></>)}</span>;
}
type Decoded={source:CanvasImageSource;width:number;height:number;close:()=>void};
const photoName=/\.(jpe?g|png|webp|heic|heif|avif)$/i;
// Opens a photo the browser can show, including iPhone HEIC in Safari; sizes respect the camera's rotation.
async function decodePhoto(file:Blob):Promise<Decoded>{
 const url=URL.createObjectURL(file);
 try{const img=new window.Image();img.decoding='async';img.src=url;await img.decode();if(img.naturalWidth&&img.naturalHeight)return {source:img,width:img.naturalWidth,height:img.naturalHeight,close:()=>URL.revokeObjectURL(url)};}catch{}
 URL.revokeObjectURL(url);
 if(typeof createImageBitmap==='function'){try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'} as ImageBitmapOptions);return {source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close()};}catch{}}
 throw new Error('Не удалось открыть фото. Снимите ещё раз или выберите снимок из галереи.');
}
function emptyCanvas(canvas:HTMLCanvasElement){canvas.width=0;canvas.height=0;}
function paint(source:CanvasImageSource,width:number,height:number){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
 if(!ctx){emptyCanvas(canvas);return null;}
 ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,width,height);return canvas;
}
// Shrinks to the long side: first lets the browser resize while decoding, otherwise halves step by step so big iPhone shots fit Safari's canvas memory.
async function shrinkTo(file:Blob,photo:Decoded,side:number){
 const scale=Math.min(1,side/Math.max(photo.width,photo.height)),width=Math.max(1,Math.round(photo.width*scale)),height=Math.max(1,Math.round(photo.height*scale));
 if(scale<1&&typeof createImageBitmap==='function'){
  try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image',resizeWidth:width,resizeHeight:height,resizeQuality:'high'} as ImageBitmapOptions);
   try{if(bitmap.width===width&&bitmap.height===height&&(photo.width>=photo.height)===(width>=height)){const canvas=paint(bitmap,width,height);if(canvas)return canvas;}}finally{bitmap.close();}
  }catch{}
 }
 let source:CanvasImageSource=photo.source,w=photo.width,h=photo.height,step:HTMLCanvasElement|null=null;
 while(w>width*2){const nw=Math.max(width,Math.round(w/2)),nh=Math.max(height,Math.round(h/2)),next=paint(source,nw,nh);if(!next)break;if(step)emptyCanvas(step);step=next;source=next;w=nw;h=nh;}
 const canvas=paint(source,width,height);if(step)emptyCanvas(step);return canvas;
}
export async function preparePhoto(file:File,avatar=false){
 if(file.type?!file.type.startsWith('image/'):!photoName.test(file.name||''))throw new Error('Выберите фотографию.');
 if(file.size>60*1024*1024)throw new Error('Фото больше 60 МБ. Снимите его обычной камерой телефона.');
 const limit=avatar?105000:475000,sides=avatar?[512,400,320]:[1600,1280,1024,800,640],photo=await decodePhoto(file);
 try{for(const side of sides){const canvas=await shrinkTo(file,photo,side);if(!canvas)continue;
  try{for(const quality of [.82,.7,.56,.42]){let data='';try{data=canvas.toDataURL('image/jpeg',quality);}catch{break;}if(!data.startsWith('data:image/jpeg;base64,')||data.length<200)break;if(data.length<limit)return data;}}finally{emptyCanvas(canvas);}
 }}finally{photo.close();}
 throw new Error('Телефон не смог подготовить это фото. Снимите ещё раз или выберите снимок из галереи.');
}
export function PhotoUpload({api,kind,onAdd,disabled=false,onBusy}:{api:API;kind:'property'|'avatar';onAdd:(id:string)=>void;disabled?:boolean;onBusy?:(v:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="photo-upload"><label className="inline-button secondary"><Upload size={16}/>{busy?'Загружаю фото…':kind==='avatar'?'Загрузить фото профиля':'Добавить фотографию'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||disabled} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy(true);onBusy?.(true);setError('');try{const data=await preparePhoto(f,kind==='avatar'),r=await api('media',{kind,data});onAdd(r.id);}catch(e:any){setError(e.message);}finally{setBusy(false);onBusy?.(false);}}}/></label>{error&&<p role="alert" className="form-error">{error}</p>}</div>;
}
