'use client';
import {useEffect,useState} from 'react';
import {Camera,ChevronLeft,ChevronRight,ImagePlus,LoaderCircle,X} from 'lucide-react';
type Photo={id:string;url:string};
const MAX_SIZE=500*1024;
async function preparePhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Выберите фото JPEG, PNG или WebP.');
 if(file.size>20*1024*1024)throw new Error('Исходная фотография должна быть меньше 20 МБ.');
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{throw new Error('Не удалось открыть фотографию. Попробуйте другой JPEG или PNG.');}
 try{
  let scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  for(let attempt=0;attempt<5;attempt++){
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Браузер не поддерживает обработку фото.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось подготовить фото.')),'image/jpeg',0.84-attempt*0.08));
   if(blob.size<=MAX_SIZE)return blob;scale*=0.8;
  }
  throw new Error('Фотография слишком большая. Выберите другой файл.');
 }finally{bitmap.close();}
}
export function PhotoUploader({photos,onChange,onBusy}:{photos:Photo[];onChange:(photos:Photo[])=>void;onBusy:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 async function upload(files:FileList|null){if(!files?.length)return;setError('');if(photos.length+files.length>8){setError('Можно добавить не больше 8 фотографий.');return;}setBusy(true);onBusy(true);const next=[...photos];
  try{for(const [index,file] of Array.from(files).entries()){setProgress(`Загружаю ${index+1} из ${files.length}…`);const image=await preparePhoto(file);const response=await fetch('/api/photos',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image});const result=await response.json() as Photo&{error?:string};if(!response.ok)throw new Error(result.error||'Не удалось загрузить фото.');next.push({id:result.id,url:result.url});onChange([...next]);}}
  catch(e:any){setError(e.message||'Не удалось загрузить фото. Попробуйте ещё раз.');}finally{setBusy(false);onBusy(false);setProgress('');}
 }
 return <section className="photo-editor"><div className="photo-heading"><div><h3>Фотографии объекта</h3><p>До 8 фото. Первое станет обложкой. Фото автоматически уменьшаются перед загрузкой.</p></div><span>{photos.length}/8</span></div><div className="photo-thumbnails">{photos.map((photo,index)=><div className="photo-thumb" key={photo.id}><img src={photo.url} alt={'Фотография объекта '+(index+1)}/>{index===0&&<span className="photo-cover-label">Обложка</span>}<button type="button" className="photo-remove" aria-label={'Убрать фотографию '+(index+1)} disabled={busy} onClick={()=>{onChange(photos.filter(p=>p.id!==photo.id));fetch('/api/photos/'+photo.id,{method:'DELETE'}).catch(()=>{});}}><X size={14}/></button>{index>0&&<button type="button" className="make-cover" disabled={busy} onClick={()=>onChange([photo,...photos.filter(p=>p.id!==photo.id)])}>На обложку</button>}</div>)}{photos.length<8&&<label className={'photo-picker '+(busy?'busy':'')}><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>{upload(e.currentTarget.files);e.currentTarget.value='';}}/>{busy?<LoaderCircle size={24} className="spin"/>:<ImagePlus size={26}/>}<b>{busy?progress:'Добавить фото'}</b><small>JPEG, PNG, WebP</small></label>}</div>{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
export function PhotoGallery({photos,title}:{photos:Photo[];title:string}){
 const [index,setIndex]=useState(0);useEffect(()=>setIndex(0),[photos[0]?.id]);
 if(!photos.length)return <div className="detail-cover"><Camera size={40} strokeWidth={1.25}/><span>Владелец пока не добавил фотографии</span></div>;
 const current=photos[Math.min(index,photos.length-1)];
 return <section className="photo-gallery" aria-label="Фотографии объекта"><div className="gallery-image"><img src={current.url} alt={title+' — фото '+(index+1)}/>{photos.length>1&&<><button type="button" className="gallery-prev" aria-label="Предыдущее фото" onClick={()=>setIndex((index+photos.length-1)%photos.length)}><ChevronLeft size={22}/></button><button type="button" className="gallery-next" aria-label="Следующее фото" onClick={()=>setIndex((index+1)%photos.length)}><ChevronRight size={22}/></button></>}<span className="gallery-count" aria-live="polite">{index+1} / {photos.length}</span></div>{photos.length>1&&<div className="gallery-thumbnails">{photos.map((photo,i)=><button type="button" key={photo.id} aria-label={'Открыть фото '+(i+1)} aria-pressed={i===index} onClick={()=>setIndex(i)}><img src={photo.url} alt=""/></button>)}</div>}</section>;
}
