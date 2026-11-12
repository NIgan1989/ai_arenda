'use client';
import {useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Camera,LoaderCircle,Star,X} from 'lucide-react';
import {Photo,preparePhoto} from './media';
import './photo-grid.css';
type API=(path:string,body?:Record<string,any>)=>Promise<any>;

// Photos of a flat as one grid: the first one is the cover and is drawn big, ★ moves a photo there, × removes it.
// Several photos can be picked at once; each shows as a loading tile until it is saved. With a mouse, tiles can be dragged.
export function PhotoGrid({photos,onChange,role,api,max=8,onBusy,disabled=false}:{photos:string[];onChange:(photos:string[])=>void;role:string;api:API;max?:number;onBusy?:(busy:boolean)=>void;disabled?:boolean}){
 const [pending,setPending]=useState(0),[error,setError]=useState(''),[drag,setDrag]=useState<string|null>(null),file=useRef<HTMLInputElement>(null);
 // On a phone a long press would lift the photo off the grid; there the ☆ button orders photos instead.
 const touch=useSyncExternalStore(()=>()=>{},()=>!!window.matchMedia?.('(hover:none) and (pointer:coarse)').matches,()=>false);
 const list=useRef(photos);
 useLayoutEffect(()=>{list.current=photos;},[photos]);
 async function add(files:FileList|null){
  const picked=Array.from(files||[]);if(!picked.length)return;
  const take=picked.slice(0,Math.max(0,max-list.current.length)),skipped=picked.length-take.length,failed:string[]=[];
  setError('');setPending(take.length);if(take.length)onBusy?.(true);
  for(const f of take){
   try{const data=await preparePhoto(f),r=await api('media',{kind:'property',data});if(!list.current.includes(r.id)&&list.current.length<max){list.current=[...list.current,r.id];onChange(list.current);}}
   catch(e:any){failed.push(e?.message||'Фото не загрузилось.');}
   finally{setPending(n=>Math.max(0,n-1));}
  }
  if(take.length)onBusy?.(false);
  setError([failed.length===1?failed[0]:failed.length?'Не загрузились '+failed.length+' фото. '+failed[0]:'',skipped?'Больше '+max+' фото добавить нельзя, лишние не вошли.':''].filter(Boolean).join(' '));
 }
 function move(from:string|null,to:number){if(!from)return;const rest=list.current.filter(x=>x!==from);rest.splice(to,0,from);list.current=rest;onChange(rest);}
 const room=photos.length+pending<max;
 return <div className="pg">
  <ul className="pg-grid" aria-label={'Фотографии: '+photos.length+' из '+max}>
   {photos.map((id,i)=><li key={id} className={'pg-tile'+(i===0?' is-cover':'')+(drag===id?' is-drag':'')} draggable={!disabled&&!touch} onDragStart={e=>{setDrag(id);e.dataTransfer.effectAllowed='move';}} onDragOver={e=>{if(drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();move(drag,i);setDrag(null);}} onDragEnd={()=>setDrag(null)}>
    <Photo id={id} role={role} alt={i===0?'Обложка':'Фото '+(i+1)}/>
    {i===0?<span className="pg-badge"><Star size={12} fill="currentColor"/>Обложка</span>:<button type="button" className="pg-btn pg-star" disabled={disabled} aria-label={'Сделать фото '+(i+1)+' обложкой'} title="Сделать обложкой" onClick={()=>onChange([id,...photos.filter(x=>x!==id)])}><Star size={16}/></button>}
    <button type="button" className="pg-btn pg-x" disabled={disabled} aria-label={'Убрать фото '+(i+1)} title="Убрать" onClick={()=>onChange(photos.filter(x=>x!==id))}><X size={16}/></button>
   </li>)}
   {Array.from({length:pending},(_,i)=><li key={'wait'+i} className="pg-tile is-pending" role="status" aria-label="Фото загружается"><LoaderCircle size={22}/></li>)}
   {room&&<li className={'pg-tile pg-add-tile'+(photos.length||pending?'':' is-first')}><button type="button" className="pg-add" disabled={disabled||pending>0} onClick={()=>file.current?.click()}><Camera size={photos.length?22:28}/><strong>{photos.length?'Ещё':'Добавить фото'}</strong>{!photos.length&&<small>Можно выбрать сразу несколько</small>}</button></li>}
  </ul>
  <p className="pg-note"><span>{photos.length} из {max}</span>Первое фото — обложка. ☆ на снимке делает его первым.</p>
  <input ref={file} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{void add(e.target.files);e.target.value='';}}/>
  {error&&<p className="pg-error" role="alert">{error}</p>}
 </div>;
}
