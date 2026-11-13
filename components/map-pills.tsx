'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Map as MapType} from 'maplibre-gl';
import {groupPins,pinWidth} from '../mobile/src/map-math';
import {ANSWER_WINDOW,answerLeft,appearDelay,pinEvent,type PinEvent,type PinState,type PinTone} from '../mobile/src/map-motion';
import type {WebPin} from '../lib/map-pin-of';
import {AI_SAYS,AI_WINDOW} from '../lib/ai-move-marks';
import './map-pills.css';

// The pins of the site's map, drawn like the app's (mobile/src/MapPins.tsx): «таблетки» with a price or a state,
// one colour per state, and one motion per event: a new pin drops in, an asked flat shakes, an answer flashes, a booking
// sends two waves, work that starts flashes, a request that ends without a yes settles. Pins that would cover each other
// fold into one with «+N»; a tap on it flies in. With «reduce motion» nothing moves.
// They are HTML over the MapLibre map: each frame of a move puts them where the map projects their points.
const toneOrder:Record<PinTone,number>={offer:0,booked:0,pending:1,active:1,booking:2,job:3,home:3};
const FRESH=900,LEAVE=260,ECHO_DELAY=450,AI_PLAY=2600;
// The AI's own work plays once per move, even when the page draws the pin again (mobile/src/MapPins.tsx does the same).
const aiShown=new Map<string,number>();
const calm=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// sparks: where guests are asking right now (owner); origin: the guest's search point, where the beams start.
export function MapPills({map,pins,selected,onSelect,onGroup,bottom=0,picking=false,sparks=[],origin=null}:{map:MapType;pins:WebPin[];selected:string;onSelect:(key:string)=>void;onGroup:(points:[number,number][])=>void;bottom?:number;picking?:boolean;sparks?:[number,number][];origin?:[number,number]|null}){
 // Redrawn on every frame of a move of the map; the pins themselves only render when their state changes.
 const [,setFrame]=useState(0);
 useEffect(()=>{let queued=0;const redraw=()=>{if(queued)return;queued=requestAnimationFrame(()=>{queued=0;setFrame(f=>f+1);});};map.on('move',redraw);map.on('resize',redraw);return()=>{map.off('move',redraw);map.off('resize',redraw);if(queued)cancelAnimationFrame(queued);};},[map]);
 // Arrivals and departures: a key seen for the first time drops in; a key that left melts away.
 const born=useRef(new Map<string,number>()),known=useRef(new Map<string,WebPin>()),[leaving,setLeaving]=useState<(WebPin&{gone:number})[]>([]);
 const gone=useMemo(()=>{
  const now=Date.now(),next=new Map(pins.map(p=>[p.key,p])),out:WebPin[]=[];
  for(const p of pins)if(!known.current.has(p.key))born.current.set(p.key,now);
  for(const [key,p] of known.current)if(!next.has(key)){out.push(p);born.current.delete(key);}
  known.current=next;return out;
 },[pins]);
 useEffect(()=>{
  setLeaving(l=>l.filter(p=>!pins.some(n=>n.key===p.key)));
  if(calm()||!gone.length)return;const at=Date.now(),batch=gone.map(p=>({...p,gone:at}));
  setLeaving(l=>[...l,...batch]);const timer=setTimeout(()=>setLeaving(l=>l.filter(p=>!batch.includes(p))),LEAVE+40);return()=>clearTimeout(timer);
 },[gone]);

 const box=map.getContainer(),w=box.clientWidth,h=box.clientHeight,cx=w/2,cy=(h-bottom)/2;
 const placed=pins.map(pin=>{const p=map.project(pin.point);return {pin,x:p.x,y:p.y};}).filter(p=>p.x>-90&&p.x<w+90&&p.y>-40&&p.y<h+40);
 const byKey=new Map(placed.map(p=>[p.pin.key,p]));
 const rank=(pin:WebPin)=>pin.key===selected?-1:pin.order?-1+pin.order/1000:toneOrder[pin.tone]*1e9+(pin.best?0:1);
 // The stops of a cleaner's route rank first: a stop is never hidden under another job, a job next to it folds into its «+N».
 const shown=groupPins(placed.map(({pin,x,y})=>({key:pin.key,x,y,width:pinWidth(pin.label)+(pin.order?22:0),height:32,rank:rank(pin)}))).map(g=>({...byKey.get(g.key)!,members:g.members}));
 const open=(members:string[])=>{
  if(map.getZoom()>=map.getMaxZoom()-.5){onSelect(members[(members.indexOf(selected)+1)%members.length]);return;}
  onGroup(members.map(k=>byKey.get(k)!.pin.point));
 };
 const now=Date.now();
 return <div className={'map-pills'+(picking?' picking':'')} aria-label={'Меток на карте: '+placed.length}>
  {sparks.map((p,i)=>{const at=map.project(p);return <span key={'spark:'+i} className="map-spark" style={{left:at.x,top:at.y,animationDelay:i*500+'ms'}} aria-hidden="true"><i/></span>;})}
  {origin&&(at=><span className="map-origin" style={{left:at.x,top:at.y}} aria-hidden="true"><i/></span>)(map.project(origin))}
  {leaving.map(p=>{const at=map.project(p.point);return <span key={'gone:'+p.key+':'+p.gone} className={'map-pill tone-'+p.tone+' leaving'} style={{left:at.x,top:at.y}} aria-hidden="true"><span className="map-pill-body">{p.label}</span></span>;})}
  {shown.map(({pin,x,y,members})=>{const b=born.current.get(pin.key)||0;
   return <Pill key={pin.key} pin={pin} x={x} y={y} more={members.length-1} active={pin.key===selected} born={now-b<FRESH?b:0} delay={appearDelay(x,y,cx,cy)} onPress={()=>members.length>1?open(members):onSelect(pin.key)}/>;})}
 </div>;
}

function Pill({pin,x,y,more,active,born,delay,onPress}:{pin:WebPin;x:number;y:number;more:number;active:boolean;born:number;delay:number;onPress:()=>void}){
 const body=useRef<HTMLButtonElement>(null),ring=useRef<HTMLSpanElement>(null),ring2=useRef<HTMLSpanElement>(null),echoRing=useRef<HTMLSpanElement>(null),wrap=useRef<HTMLSpanElement>(null);
 // While the map has just come back (map-memory.ts ECHO_WINDOW), a change against how the pin looked when the person left
 // carries pin.was too: a stale first answer that is then refreshed still echoes.
 // A pin that comes back changed (pin.was) starts from how it looked then and plays the change after the page has turned.
 const last=useRef<PinState>(pin.was||{tone:pin.tone,label:pin.label}),echo=useRef(!!pin.was);
 useEffect(()=>{if(!born||calm()||!wrap.current)return;wrap.current.animate([{opacity:0,transform:'translateY(-18px) scale(.4)'},{opacity:1,offset:.3},{opacity:1,transform:'translateY(2px) scale(1.04)',offset:.75},{opacity:1,transform:'none'}],{duration:520,delay,easing:'cubic-bezier(.2,.8,.3,1)',fill:'backwards'});},[]);
 useEffect(()=>{
  const event:PinEvent=pinEvent(last.current,{tone:pin.tone,label:pin.label}),echoed=echo.current||!!pin.was;last.current={tone:pin.tone,label:pin.label};echo.current=false;
  if(calm()||event==='none'||event==='appear'||!body.current)return;
  const wait=echoed?ECHO_DELAY:0,el=body.current;
  const bounce=(to:number)=>el.animate([{transform:'scale(1)'},{transform:`scale(${1+to})`,offset:.25},{transform:`scale(${1-to/3})`,offset:.6},{transform:'scale(1)'}],{duration:520,delay:wait,easing:'ease-out'});
  const burst=()=>ring.current?.animate([{opacity:0,transform:'scale(.5)'},{opacity:.6,offset:.05},{opacity:0,transform:'scale(2.6)'}],{duration:700,delay:wait,easing:'cubic-bezier(.2,.7,.3,1)'});
  const wiggle=()=>el.animate([{transform:'rotate(0)'},{transform:'rotate(-9deg)',offset:.2},{transform:'rotate(8deg)',offset:.4},{transform:'rotate(-5deg)',offset:.6},{transform:'rotate(3deg)',offset:.8},{transform:'rotate(0)'}],{duration:420,delay:wait});
  ({ask:()=>{wiggle();},answer:()=>{burst();bounce(.28);},celebrate:()=>{burst();bounce(.4);ring2.current?.animate([{opacity:0,transform:'scale(.6)'},{opacity:.8,offset:.05},{opacity:0,transform:'scale(3.4)'}],{duration:900,delay:wait+240,easing:'cubic-bezier(.2,.7,.3,1)'});},start:()=>{burst();bounce(.16);},settle:()=>{bounce(-.12);},update:()=>{bounce(.16);}} as Record<string,()=>void>)[event]?.();
  // The echo: two wide waves of the accent colour go out from a pin that changed while the person was elsewhere.
  if(echoed)echoRing.current?.animate([{opacity:0,transform:'scale(.8)'},{opacity:1,offset:.08},{opacity:.5,offset:.7},{opacity:0,transform:'scale(2.8)'}],{duration:900,delay:wait,iterations:2,easing:'ease-out'});
 },[pin.tone,pin.label]);
 // The sign of the AI (pin.ai): a ring in its colours runs round the pin once and a short line lifts above it.
 const [aiText,setAiText]=useState(''),aiRing=useRef<HTMLSpanElement>(null),aiSays=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const move=pin.ai;if(!move||aiShown.get(pin.key)===move.at)return;
  aiShown.set(pin.key,move.at);if(calm()||Date.now()/1000-move.at>AI_WINDOW)return;
  setAiText(AI_SAYS[move.move]);const timer=setTimeout(()=>setAiText(''),AI_PLAY+(pin.was?ECHO_DELAY:0)+400);return()=>clearTimeout(timer);
 },[pin.ai?.at,pin.ai?.move]);
 useEffect(()=>{
  if(!aiText)return;const wait=(pin.was?ECHO_DELAY:0)+260;
  aiRing.current?.animate([{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'scale(1.04)',offset:.12},{opacity:.9,transform:'scale(1.06)',offset:.7},{opacity:0,transform:'scale(1.14)'}],{duration:AI_PLAY,delay:wait,fill:'both'});
  aiSays.current?.animate([{opacity:0,transform:'translate(-50%,6px)'},{opacity:1,transform:'translate(-50%,0)',offset:.1},{opacity:1,offset:.75},{opacity:0,transform:'translate(-50%,-8px)'}],{duration:AI_PLAY,delay:wait,fill:'both'});
 },[aiText]);
 // The time left to answer runs down under the label; a cleaning under way fills its strip.
 // Read once per deadline, so the frames of a map move do not restart the strip.
 const left=useMemo(()=>pin.tone==='pending'&&pin.until?answerLeft(pin.until,Date.now()/1000):0,[pin.tone,pin.until]);
 const label=(pin.order?'Остановка '+pin.order+'. ':'')+pin.title+', '+pin.label+(pin.progress!=null?', прошло '+Math.round(pin.progress*100)+'% времени':'')+(pin.best?', лучший выбор':'')+(more?'. Рядом ещё '+more+'. Приблизить':'');
 return <span ref={wrap} className={'map-pill tone-'+pin.tone+(active?' active':'')+(pin.best?' best':'')+(pin.order?' ordered':'')} style={{left:x,top:y,zIndex:active?3:pin.tone==='offer'||pin.tone==='booked'?2:1}}>
  {(pin.tone==='pending'||pin.tone==='active')&&<span className="map-pill-breath" aria-hidden="true"/>}
  <span ref={ring} className="map-pill-ring" aria-hidden="true"/>
  <span ref={ring2} className="map-pill-ring wave" aria-hidden="true"/>
  <span ref={echoRing} className="map-pill-ring echo" aria-hidden="true"/>
  {!!aiText&&<span ref={aiRing} className="map-pill-ai" style={{['--ai-w' as string]:pinWidth(pin.label)+(pin.order?22:0)+12+'px'}} aria-hidden="true"/>}
  {!!aiText&&<span ref={aiSays} className="map-pill-ai-says" role="status">✦ {aiText}</span>}
  <button ref={body} type="button" className="map-pill-body" aria-label={label} aria-pressed={active} onClick={e=>{e.stopPropagation();onPress();}}>
   {!!pin.order&&<b className="map-pill-order">{pin.order}</b>}
   {pin.best&&<i className="map-pill-star" aria-hidden="true">✦ </i>}{pin.label}{more>0&&<small> +{more}</small>}
   {left>0&&<span className="map-pill-strip" aria-hidden="true"><span style={{transform:`scaleX(${left})`,animationDuration:Math.round(left*ANSWER_WINDOW)+'s'}}/></span>}
   {pin.progress!=null&&<span className="map-pill-strip work" aria-hidden="true"><span style={{transform:`scaleX(${pin.progress})`}}/></span>}
  </button>
 </span>;
}
