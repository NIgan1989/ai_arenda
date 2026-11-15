import {useSyncExternalStore} from 'react';
import {AppState,Linking,Platform} from 'react-native';
import * as Location from 'expo-location';
import {betterFix,isFresh,type HereFix,type HereStatus} from './here-rules';

// Where the person is, for the whole app: one place that asks the phone, so the map, the guest's search and the
// navigation all see the same point, and the phone is never asked twice at once.
// Why a single getCurrentPosition was not enough: on Android it can wait forever indoors or with GPS off, on iOS the
// person may allow only an approximate place, and before the first fix there is nothing to show. So the phone's
// remembered point is shown at once, a fresh one is asked with a time limit, a coarser one after it, and then a short
// watch makes the point sharper.
export type Here={status:HereStatus;fix:HereFix|null;reduced:boolean};
// ask: 'never' — only if already allowed (at launch, before sign-in); 'first' — show the system prompt only if it was
// never shown (the first visit of the map); 'always' — the person pressed the button: ask again when the phone allows it.
// precise: the navigation needs a street-level point.
export type LocateOptions={ask?:'never'|'first'|'always';precise?:boolean};

let here:Here={status:'idle',fix:null,reduced:false};
const listeners=new Set<()=>void>();
function set(next:Partial<Here>){here={...here,...next};listeners.forEach(l=>l());}
export const getHere=()=>here;
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const useHere=()=>useSyncExternalStore(subscribe,getHere,getHere);
// A point from anywhere in the app (the navigation's watch) keeps the shared one current.
export function offerFix(pos:Location.LocationObject,rough=false){
 const {longitude,latitude,accuracy}=pos.coords;
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude))return;
 const fix:HereFix={point:[longitude,latitude],accuracy:Math.max(1,Math.round(accuracy??(rough?1000:100))),at:pos.timestamp||Date.now(),rough};
 if(betterFix(here.fix,fix))set({fix});
}
const within=<T,>(task:Promise<T>,ms:number)=>new Promise<T>((done,fail)=>{const timer=setTimeout(()=>fail(Error('timeout')),ms);task.then(v=>{clearTimeout(timer);done(v);},e=>{clearTimeout(timer);fail(e);});});

let running:{task:Promise<Here>;ask:LocateOptions['ask'];precise:boolean}|null=null;
export function locate(options:LocateOptions={}):Promise<Here>{
 const ask=options.ask||'never',precise=!!options.precise;
 // A silent check that is already running is not enough for a press of the button or for the navigation: they wait for it and go on.
 if(running){
  const weaker=(ask!=='never'&&running.ask==='never')||(precise&&!running.precise);
  if(!weaker)return running.task;
  return running.task.then(()=>locate(options));
 }
 const task=find(ask,precise).finally(()=>{if(running?.task===task)running=null;});
 running={task,ask,precise};
 return task;
}

async function find(ask:NonNullable<LocateOptions['ask']>,precise:boolean):Promise<Here>{
 set({status:'searching'});
 try{
  let permission=await Location.getForegroundPermissionsAsync();
  const mayAsk=permission.canAskAgain&&(ask==='always'||(ask==='first'&&permission.status==='undetermined'));
  if(!permission.granted&&mayAsk)permission=await Location.requestForegroundPermissionsAsync();
  if(!permission.granted){
   set({status:permission.status==='undetermined'?'idle':permission.canAskAgain?'denied':'blocked'});
   return here;
  }
  const reduced=permission.ios?.accuracy==='reduced'||permission.android?.accuracy==='coarse';
  set({reduced});
  let on=await Location.hasServicesEnabledAsync().catch(()=>true);
  // Android shows its own «Turn on location» dialog; iOS sends the person to Settings.
  if(!on&&ask!=='never'&&Platform.OS==='android'){try{await Location.enableNetworkProviderAsync();on=await Location.hasServicesEnabledAsync();}catch{/* The person said no. */}}
  if(!on){set({status:'off'});return here;}
  // What the phone remembers is shown at once, while a fresh point is on its way.
  const last=await Location.getLastKnownPositionAsync({maxAge:30*60000}).catch(()=>null);
  if(last)offerFix(last,true);
  if(!precise&&isFresh(here.fix)){set({status:'found'});return here;}
  const steps:[Location.Accuracy,number][]=precise?[[Location.Accuracy.High,15000],[Location.Accuracy.Balanced,8000]]:[[Location.Accuracy.Balanced,10000],[Location.Accuracy.Low,8000]];
  let fresh:Location.LocationObject|null=null;
  for(const [accuracy,ms] of steps){
   try{fresh=await within(Location.getCurrentPositionAsync({accuracy}),ms);break;}catch{/* The next, coarser way. */}
  }
  if(fresh)offerFix(fresh);
  else if(!here.fix){const old=await Location.getLastKnownPositionAsync().catch(()=>null);if(old)offerFix(old,true);}
  if(!here.fix){set({status:'failed'});return here;}
  set({status:fresh||isFresh(here.fix)?'found':'failed'});
  if(fresh&&(fresh.coords.accuracy??999)>40)void sharpen();
  return here;
 }catch{
  set({status:here.fix?'found':'failed'});
  return here;
 }
}

// After a coarse point, the phone is listened to for a little while, until it knows the place to a few dozen metres.
let sharpening:Location.LocationSubscription|null=null,sharpBusy=false;
async function sharpen(){
 if(sharpening||sharpBusy)return;sharpBusy=true;
 let sub:Location.LocationSubscription|null=null,done=false;
 const stop=()=>{done=true;if(sub&&sharpening===sub){sub.remove();sharpening=null;}};
 try{
  sub=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:2000,distanceInterval:5},pos=>{offerFix(pos);if((pos.coords.accuracy??999)<=30)stop();});
  if(done){sub.remove();return;}
  sharpening=sub;
  setTimeout(stop,25000);
 }catch{/* The point we have stays. */}
 finally{sharpBusy=false;}
}

// At launch, before sign-in: a point is taken if the person allowed it before, without any prompt. When the person
// comes back from Settings (or turned geolocation on), the app looks again by itself.
let started=false;
export function startHere(){
 if(started)return;started=true;
 void locate({ask:'never'});
 AppState.addEventListener('change',state=>{
  if(state!=='active')return;
  if(here.status==='denied'||here.status==='blocked'||here.status==='off'||here.status==='failed'||(here.fix&&!isFresh(here.fix)))void locate({ask:'never'});
 });
}
export const openLocationSettings=()=>{void Linking.openSettings().catch(()=>{});};
