'use client';
import {useCallback,useEffect,useState} from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import {ChevronLeft,ChevronRight,Expand} from 'lucide-react';
import {Photo} from './media';
import {PhotoViewer} from './photo-viewer';
import './property-gallery.css';
export function PropertyGallery({photos,role,publicView,title}:{photos:string[];role:string;publicView:boolean;title:string}){
 const [ref,api]=useEmblaCarousel({loop:photos.length>1}),[index,setIndex]=useState(0),[view,setView]=useState<string[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const selected=useCallback(()=>setIndex(api?.selectedScrollSnap()||0),[api]);
 useEffect(()=>{if(!api)return;selected();api.on('select',selected);return()=>{api.off('select',selected);};},[api,selected]);
 // Revalidate every photo at the protected endpoint when opening; never persist private media URLs.
 async function open(){setBusy(true);setError('');try{const images=await Promise.all(photos.map(async id=>{const r=await fetch((publicView?'/api/public/media/':'/api/media/')+encodeURIComponent(id),{headers:publicView?{}:{'X-Workspace-Role':role},cache:'no-store'});if(!r.ok)throw Error('Фото недоступно. Проверьте подключение и права доступа.');return (await r.json() as {data:string}).data;}));setView(images);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <><div className="property-gallery" ref={ref}><div className="property-gallery-track">{(photos.length?photos:[undefined]).map((id,i)=><div className="property-gallery-slide" key={id||'empty'}>{Math.abs(index-i)<=1?<Photo id={id} publicView={publicView} role={role} alt={title+', фото '+(i+1)}/>:null}</div>)}</div></div>{photos.length>0&&<button className="gallery-open" type="button" disabled={busy} onClick={open} aria-label="Открыть фотографии"><Expand size={18}/>{busy?'Загрузка…':''}</button>}{photos.length>1&&<div className="gallery-controls"><button type="button" aria-label="Предыдущее фото" onClick={()=>api?.scrollPrev()}><ChevronLeft size={18}/></button><span>{index+1} / {photos.length}</span><button type="button" aria-label="Следующее фото" onClick={()=>api?.scrollNext()}><ChevronRight size={18}/></button></div>}{error&&<span className="gallery-error" role="alert">{error}</span>}{view&&<PhotoViewer images={view} index={index} onClose={()=>setView(null)}/>}</>;
}
