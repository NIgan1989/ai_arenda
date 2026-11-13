'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import Chat from '../app/chat';
import {rolePages} from '../lib/access';
import type {Role} from '../lib/domain';
import {sheetTitle,workspaceTarget,WORKSPACE_GO} from '../lib/map-shell';
import './map-shell.css';

// On a phone the map is the only screen. Every other section opens as a sheet over it, without a page load,
// and closes back to the map. On a wide screen each section stays a page of its own beside the sidebar.
export function MapShell({role,section:first,accountId}:{role:Role;section:string;accountId:string}){
 const [at,setAt]=useState({section:first,search:''}),[phone,setPhone]=useState(false),pushed=useRef(0),drag=useRef<{y:number;dy:number}|null>(null),sheet=useRef<HTMLDivElement>(null);
 const open=at.section!=='map';
 useEffect(()=>{setAt(v=>v.section===first?v:{section:first,search:window.location.search});},[first]);
 useEffect(()=>{const q=window.matchMedia('(max-width:700px)'),set=()=>setPhone(q.matches);set();setAt(v=>({...v,search:window.location.search}));q.addEventListener('change',set);return()=>q.removeEventListener('change',set);},[]);
 useEffect(()=>{
  if(!phone)return;
  const sections=rolePages[role].map(p=>p.id);
  const show=(href:string)=>{
   const to=workspaceTarget(href,window.location.origin,role,sections);if(!to)return false;
   if(to.section==='map'&&!to.search&&pushed.current>0){window.history.back();return true;}
   window.history.pushState({mapShell:true},'',to.path);pushed.current++;setAt({section:to.section,search:to.search});return true;
  };
  const click=(e:MouseEvent)=>{
   if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
   const a=(e.target as Element|null)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.target&&a.target!=='_self'||a.hasAttribute('download'))return;
   if(show(a.href))e.preventDefault();
  };
  const code=(e:Event)=>{if(show(String((e as CustomEvent).detail||'')))e.preventDefault();};
  const back=()=>{const to=workspaceTarget(window.location.href,window.location.origin,role,sections);if(to){pushed.current=Math.max(0,pushed.current-1);setAt({section:to.section,search:to.search});}};
  document.addEventListener('click',click);window.addEventListener(WORKSPACE_GO,code);window.addEventListener('popstate',back);
  return()=>{document.removeEventListener('click',click);window.removeEventListener(WORKSPACE_GO,code);window.removeEventListener('popstate',back);};
 },[phone,role]);
 // Closing returns to the map the person came from; a sheet opened by a direct link has no map behind it in history.
 function close(){if(pushed.current>0){window.history.back();return;}window.history.replaceState(null,'','/workspace/'+role+'/map');setAt({section:'map',search:''});}
 useEffect(()=>{if(!open||!phone)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('[role=dialog][data-open],[role=dialog][open]'))close();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,phone]);
 // The head of the sheet pulls it down, as the map's own sheet does.
 const touch={
  onTouchStart:(e:React.TouchEvent)=>{drag.current={y:e.touches[0].clientY,dy:0};},
  onTouchMove:(e:React.TouchEvent)=>{if(!drag.current||!sheet.current)return;const dy=Math.max(0,e.touches[0].clientY-drag.current.y);drag.current.dy=dy;sheet.current.style.transition='none';sheet.current.style.transform='translateY('+dy+'px)';},
  onTouchEnd:()=>{const d=drag.current;drag.current=null;if(!sheet.current)return;sheet.current.style.transition='';sheet.current.style.transform='';if(d&&d.dy>96)close();},
 };
 return <div className={'map-shell'+(phone?' is-phone':'')} data-open={open||undefined}>
  {(!open||phone)&&<div className="map-shell-map" inert={open||undefined} aria-hidden={open||undefined}><Chat key={role+':map'} workspaceRole={role} section="map" accountId={accountId}/></div>}
  {open&&<>
   {phone&&<button type="button" className="map-shell-scrim" aria-label="Вернуться на карту" onClick={close}/>}
   <div className="map-shell-sheet" ref={sheet} role={phone?'dialog':undefined} aria-label={phone?sheetTitle(role,at.section):undefined}>
    <header className="map-shell-head" {...touch}><i aria-hidden="true"/><h2>{sheetTitle(role,at.section)}</h2><button type="button" aria-label="Закрыть и вернуться на карту" onClick={close}><X size={18}/></button></header>
    <div className="map-shell-body"><Chat key={role+':'+at.section+at.search} workspaceRole={role} section={at.section} accountId={accountId} sheet/></div>
   </div>
  </>}
 </div>;
}
