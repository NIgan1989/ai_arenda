'use client';
import {useEffect,useRef,useState} from 'react';
import {LOGO_PATH} from './entry-splash';

// One loading signal for the whole site: a thin gradient line along the top edge, and for a wait longer than
// a second and a half a small glass pill with the logo. It covers three cases without touching any page:
// the page is opening or reloading (it is on from the server's first byte until the page has loaded),
// a move to another page (a click on a link, a reload, a redirect from code), and a long action — any request
// that starts within a moment after a tap, a key or a form send. Background refreshes never show it.
const GESTURE_WINDOW=1500, SHOW_AFTER=250, PILL_AFTER=1500, NAV_TIMEOUT=12000;

type Listener=()=>void;
const state={requests:0,navigating:false,lastGesture:0,listeners:new Set<Listener>()};
const emit=()=>state.listeners.forEach(l=>l());

function sameDocumentLink(event:MouseEvent){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return false;
  const link=(event.target as Element|null)?.closest?.('a[href]') as HTMLAnchorElement|null;
  if(!link||link.target&&link.target!=='_self'||link.hasAttribute('download'))return false;
  const url=new URL(link.href,location.href);
  if(url.origin!==location.origin)return false;
  // A jump within the page is not a load.
  return !(url.pathname===location.pathname&&url.search===location.search&&url.hash);
}

let installed=false;
function install(){
  if(installed||typeof window==='undefined')return;installed=true;
  const gesture=()=>{state.lastGesture=Date.now();};
  window.addEventListener('pointerdown',gesture,true);
  window.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')gesture();},true);
  window.addEventListener('submit',gesture,true);
  let navTimer:ReturnType<typeof setTimeout>|undefined;
  const navigate=()=>{state.navigating=true;emit();clearTimeout(navTimer);navTimer=setTimeout(()=>{state.navigating=false;emit();},NAV_TIMEOUT);};
  document.addEventListener('click',e=>{if(sameDocumentLink(e))queueMicrotask(()=>{if(!e.defaultPrevented)navigate();});});
  window.addEventListener('beforeunload',navigate);
  // Coming back with the browser's Back button restores the old page as it was, line included.
  window.addEventListener('pageshow',e=>{if(e.persisted){clearTimeout(navTimer);state.navigating=false;state.requests=0;emit();}});
  window.addEventListener('popstate',()=>{clearTimeout(navTimer);state.navigating=false;emit();});
  const original=window.fetch.bind(window);
  window.fetch=(...args:Parameters<typeof fetch>)=>{
    const tracked=Date.now()-state.lastGesture<GESTURE_WINDOW;
    if(!tracked)return original(...args);
    state.requests++;emit();
    // A request that follows a tracked one (save, then reload the list) belongs to the same action.
    const settle=()=>{state.requests--;state.lastGesture=Math.max(state.lastGesture,Date.now()-GESTURE_WINDOW+300);emit();};
    return original(...args).finally(settle);
  };
}

export function AppLoader(){
  // On the server and in the first paint the line is already running: the page is still loading.
  const [busy,setBusy]=useState(true),[progress,setProgress]=useState(0.18),[visible,setVisible]=useState(true),[pill,setPill]=useState(false);
  const running=useRef(true);
  useEffect(()=>{
    install();
    let show:ReturnType<typeof setTimeout>|undefined,showPill:ReturnType<typeof setTimeout>|undefined,hide:ReturnType<typeof setTimeout>|undefined,creep:ReturnType<typeof setInterval>|undefined;
    const clear=()=>{clearTimeout(show);clearTimeout(showPill);clearTimeout(hide);clearInterval(creep);};
    const start=(now:boolean)=>{
      clear();running.current=true;setBusy(true);
      show=setTimeout(()=>setVisible(true),now?0:SHOW_AFTER);
      showPill=setTimeout(()=>setPill(true),PILL_AFTER);
      // The line creeps forward ever slower and never reaches the end on its own.
      creep=setInterval(()=>setProgress(p=>p+(0.92-p)*0.07),180);
    };
    const finish=()=>{
      clear();running.current=false;setBusy(false);setPill(false);setProgress(1);
      hide=setTimeout(()=>{setVisible(false);setProgress(0.08);},380);
    };
    const update=()=>{const next=state.navigating||state.requests>0;if(next===running.current)return;if(next)start(state.navigating);else finish();};
    state.listeners.add(update);
    // The first run covers the page load itself.
    creep=setInterval(()=>setProgress(p=>p+(0.92-p)*0.07),180);
    const loaded=()=>{if(!state.navigating&&!state.requests)finish();};
    if(document.readyState==='complete')queueMicrotask(loaded);else window.addEventListener('load',loaded,{once:true});
    return()=>{clear();state.listeners.delete(update);window.removeEventListener('load',loaded);};
  },[]);
  return <>
    <div className="app-loader" data-visible={visible&&progress>0.05?'true':'false'} data-done={!busy?'true':'false'} role="progressbar" aria-label="Загрузка" aria-hidden={!busy} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)}>
      <span className="app-loader-bar" style={{transform:`scaleX(${progress})`}}/>
    </div>
    <div className="app-loader-pill" data-visible={pill&&busy?'true':'false'} role="status" aria-live="polite">
      {pill&&busy&&<><svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true"><path d={LOGO_PATH} pathLength={1}/></svg><span>Секунду…</span></>}
    </div>
  </>;
}
