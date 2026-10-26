'use client';
import {useEffect,useState} from 'react';
import {Image as ImageIcon,UserRound,Upload} from 'lucide-react';
type API=(path:string,body?:Record<string,any>)=>Promise<any>;
export function Photo({id,role,alt,avatar=false,publicView=false}:{id?:string|null;role:string;alt:string;avatar?:boolean;publicView?:boolean}){
 const [uri,setUri]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;setUri('');setFailed(false);if(id)fetch((publicView?'/api/public/media/':'/api/media/')+encodeURIComponent(id),{headers:publicView?{}:{'X-Workspace-Role':role},cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json() as Promise<{data:string}>;}).then(r=>{if(live)setUri(r.data);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[id,role,publicView]);
 return uri&&!failed?<img className={avatar?'profile-photo':'listing-photo'} src={uri} alt={alt} onError={()=>setFailed(true)}/>:<span className={avatar?'profile-photo photo-placeholder':'listing-photo photo-placeholder'} role="img" aria-label={alt}>{avatar?<UserRound size={26}/>:<><ImageIcon size={30}/><small>{failed?'Фото недоступно':'Фотографии ещё не добавлены'}</small></>}</span>;
}
export async function preparePhoto(file:File,avatar=false){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('Выберите JPEG, PNG или WebP до 15 МБ.');
 const url=URL.createObjectURL(file);
 try{const img=new window.Image();img.src=url;await img.decode();const max=avatar?512:1600,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Браузер не смог обработать фото.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);let data='';for(const quality of [.82,.68,.5,.35]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<(avatar?105000:475000))return data;}throw new Error('Не удалось уменьшить фото. Выберите менее крупный снимок.');}finally{URL.revokeObjectURL(url);}
}
export function PhotoUpload({api,kind,onAdd,disabled=false,onBusy}:{api:API;kind:'property'|'avatar';onAdd:(id:string)=>void;disabled?:boolean;onBusy?:(v:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="photo-upload"><label className="inline-button secondary"><Upload size={16}/>{busy?'Загружаю фото…':kind==='avatar'?'Загрузить фото профиля':'Добавить фотографию'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||disabled} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy(true);onBusy?.(true);setError('');try{const data=await preparePhoto(f,kind==='avatar'),r=await api('media',{kind,data});onAdd(r.id);}catch(e:any){setError(e.message);}finally{setBusy(false);onBusy?.(false);}}}/></label>{error&&<p role="alert" className="form-error">{error}</p>}</div>;
}
