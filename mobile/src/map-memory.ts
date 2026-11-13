// What the home map keeps while the person is on another page. Pure, covered by mobile/tests/map-memory.test.mjs.
// The map is closed when another tab opens (App.tsx renders it only on «Карта»), so without this every return would start
// from the whole city again. It keeps, per account and role: where the camera was, the chosen pin, the last map answer
// (so the pins are there at once) and how each pin looked, so a pin whose state changed meanwhile can answer for it.
import type {PinState,PinTone} from './map-motion';
import type {MapPoint} from './map-math';

export type MapView={center:MapPoint;zoom:number};
// viewKey: the set of pins the camera was looking at (the focusKey of the map); stage: its first part, the panel's state.
export type MapMemory={at:number;view:MapView|null;viewKey:string;selected:string;stage:string;pins:Record<string,PinState>;city:string;data:any};
// What «На карте» on a page asks the map to show.
export type MapTarget={kind:'booking'|'job'|'property';id:string};
// After half an hour a return to the map starts from the city again, as a new visit.
export const MAP_KEEP=30*60*1000;

const store=new Map<string,MapMemory>();
const empty=(at:number):MapMemory=>({at,view:null,viewKey:'',selected:'',stage:'',pins:{},city:'',data:null});
// On the site a tab of the bottom menu is a new page, so the memory also lives in the tab's sessionStorage (without the
// map answer, which the page asks again). The app has no sessionStorage and keeps it in memory only.
const SAVED='ai-arenda:map-memory';
const session=()=>{try{return typeof sessionStorage!=='undefined'?sessionStorage:null;}catch{return null;}};
let loaded=false;
function load(){
 if(loaded)return;loaded=true;
 const box=session();if(!box)return;
 try{const saved=JSON.parse(box.getItem(SAVED)||'{}');for(const scope of Object.keys(saved))if(!store.has(scope))store.set(scope,{...empty(0),...saved[scope],data:null});}catch{}
}
function save(){
 const box=session();if(!box)return;
 try{const out:Record<string,Omit<MapMemory,'data'>>={};for(const [scope,{data,...rest}] of store)out[scope]=rest;box.setItem(SAVED,JSON.stringify(out));}catch{}
}

export function recallMap(scope:string,now=Date.now()):MapMemory|null{
 load();
 const kept=store.get(scope);
 if(!kept)return null;
 if(now-kept.at>MAP_KEEP){store.delete(scope);save();return null;}
 return kept;
}
export function rememberMap(scope:string,patch:Partial<Omit<MapMemory,'at'>>,now=Date.now()){
 const kept=recallMap(scope,now)||empty(now);
 store.set(scope,{...kept,...patch,at:now});
 save();
}
export function forgetMaps(){load();store.clear();save();}

// The panel's state is the first part of the key of a set of pins: 'owner:5' → 'owner', 'preview:1700000000' → 'preview'.
// Pins are compared only within one state: a flat in the guest's search list is not «changed» by the plain city map.
export const stageOf=(focusKey:string)=>focusKey.split(':')[0]||'';
export function pinStates(pins:{key:string;tone?:PinTone;label:string}[]):Record<string,PinState>{
 const states:Record<string,PinState>={};
 for(const p of pins)states[p.key]={tone:p.tone||'home',label:p.label};
 return states;
}
// Pins whose state differs from the one remembered get it as «was»: the pin then plays that change once on return.
// A pin reads «was» only when it appears, so later refreshes are compared by the pins themselves, as always;
// the map stops adding it a few seconds after the return (ECHO_WINDOW, MapHome).
export const ECHO_WINDOW=10000;
export function withEchoes<P extends {key:string;tone?:PinTone;label:string}>(pins:P[],before:{stage:string;pins:Record<string,PinState>}|null,stage:string):(P&{was?:PinState})[]{
 if(!before||before.stage!==stage)return pins;
 return pins.map(p=>{
  const was=before.pins[p.key];
  return was&&(was.tone!==(p.tone||'home')||was.label!==p.label)?{...p,was}:p;
 });
}

// The pin «На карте» opens, by role: the guest's map shows flats by their id, the owner's shows own objects as
// 'property:<id>' (a booking or a cleaning is shown at its object), the cleaner's shows cleanings as 'job:<id>'.
// city: where it is, so the map can move to that city first. null: this role's map has no pin for it.
export function targetPin(role:string,target:MapTarget,data:{bookings?:any[];jobs?:any[];properties?:any[];ownProperties?:any[]}):{key:string;city:string}|null{
 const find=(list:any[]|undefined,id:string)=>(list||[]).find(r=>r?.id===id);
 const city=(row:any)=>String(row?.city||'');
 if(target.kind==='property'){
  const flat=find(data.ownProperties,target.id)||find(data.properties,target.id);
  if(role==='owner')return {key:'property:'+target.id,city:city(flat)};
  if(role==='guest')return {key:target.id,city:city(flat)};
  return null;
 }
 if(target.kind==='booking'){
  const b=find(data.bookings,target.id);if(!b?.property_id)return null;
  if(role==='owner')return {key:'property:'+b.property_id,city:city(b)};
  if(role==='guest')return {key:String(b.property_id),city:city(b)};
  return null;
 }
 const j=find(data.jobs,target.id);if(!j)return null;
 if(role==='cleaner')return {key:'job:'+target.id,city:city(j)};
 if(role==='owner'&&j.property_id)return {key:'property:'+j.property_id,city:city(j)};
 return null;
}

// What the map does with a remembered view when a set of pins is announced:
// show: it is the same set as when the person left, the view is shown as it was and the memory is used up;
// hold: no pins yet (the map is still asking), the view is shown and the memory waits for the pins;
// fit: another set (the search changed, or nothing is remembered), the map frames the pins as usual.
export function restoreStep(restore:{key:string}|null|undefined,focusKey:string,pins:number):'show'|'hold'|'fit'{
 if(!restore)return 'fit';
 if(focusKey===restore.key)return 'show';
 return pins?'fit':'hold';
}
