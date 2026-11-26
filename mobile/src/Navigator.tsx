import {t as tr} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import * as Location from 'expo-location';
import {request} from './api';
import {C,type} from './styles';
import {T} from './tokens';
import {h} from './SheetParts';
import {SwipeConfirm} from './SwipeConfirm';
import {menuIcons,type MenuIcon} from './AccountRows';
import {arrived,distanceText,minutesText,navState,offRoute,turnArrow,type NavRoute,type NavState} from './navigation';
import type {MapPoint} from './map-math';
import {locate,offerFix,openLocationSettings} from './here';
import {ROUTE_ACCURACY,ROUTE_MAX_AGE,type HereFix} from './here-rules';

// Navigation on our own map, like a taxi app: the road route from where the person is to the object,
// their point on the map, the next turn and what is left. The route comes from our server (Stadia Maps or the test router);
// while the trip lasts the owner sees the cleaner's point, as the cleaner agreed by tapping «Поехали».
// A guest only asks for the way: their point is not shared with the owner.
export type Trip={kind:'job'|'booking';id:string;title:string;target:MapPoint};
type Status='idle'|'locating'|'routing'|'driving'|'arrived';
const REROUTE_AFTER=30000,POINT_EVERY=5000;
const asPosition=(fix:HereFix)=>({coords:{longitude:fix.point[0],latitude:fix.point[1],accuracy:fix.accuracy,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:fix.at}) as Location.LocationObject;
const fail=(e:unknown)=>e instanceof Error&&e.message?e.message:tr('Не удалось построить маршрут. Попробуйте ещё раз.');

// skew: the server's clock minus the phone's, in seconds, so positions carry the server's time.
export function useTrip(role:'cleaner'|'guest',skew:number){
 const [trip,setTrip]=useState<Trip|null>(null),[route,setRoute]=useState<NavRoute|null>(null),[here,setHere]=useState<{point:MapPoint;accuracy:number}|null>(null);
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[rerouted,setRerouted]=useState(0);
 const watch=useRef<Location.LocationSubscription|null>(null),sharing=useRef(''),lastRoute=useRef(0),lastPoint=useRef(0),routing=useRef(false),live=useRef({trip,route,skew});
 live.current={trip,route,skew};
 const stamp=(at:number)=>Math.round(at/1000+live.current.skew);
 async function stopSharing(){const id=sharing.current;sharing.current='';if(id)await request('/api/operations/map/journey/stop',{id},undefined,undefined,role).catch(()=>{});}
 function stopWatch(){watch.current?.remove();watch.current=null;}
 async function reroute(t:Trip,pos:Location.LocationObject){
  if(routing.current)return;routing.current=true;
  try{
   const result=await request('/api/operations/map/route',{kind:t.kind,entityId:t.id,mode:'driving',routingConsent:true,shareWithOwner:role==='cleaner',longitude:pos.coords.longitude,latitude:pos.coords.latitude,accuracy:Math.min(500,Math.round(pos.coords.accuracy??50)),recordedAt:stamp(pos.timestamp)},undefined,undefined,role);
   setRoute(result.route);if(result.sharing?.id)sharing.current=result.sharing.id;lastRoute.current=Date.now();setRerouted(n=>n+1);setStatus('driving');setError('');
  }finally{routing.current=false;}
 }
 function onPosition(pos:Location.LocationObject){
  const t=live.current.trip;if(!t)return;
  offerFix(pos);
  const point:MapPoint=[pos.coords.longitude,pos.coords.latitude],accuracy=pos.coords.accuracy??50;setHere({point,accuracy});
  if(arrived(point,t.target)){void finish(true);return;}
  const r=live.current.route;
  if(r&&offRoute(navState(r,point),accuracy)&&Date.now()-lastRoute.current>REROUTE_AFTER)void reroute(t,pos).catch(e=>setError(fail(e)));
  if(sharing.current&&accuracy<=500&&Date.now()-lastPoint.current>=POINT_EVERY){lastPoint.current=Date.now();void request('/api/operations/map/journey/point',{id:sharing.current,longitude:point[0],latitude:point[1],accuracy:Math.round(accuracy),recordedAt:stamp(pos.timestamp)},undefined,undefined,role).catch(()=>{});}
 }
 async function start(t:Trip){
  setTrip(t);live.current.trip=t;setRoute(null);setError('');setStatus('locating');
  try{
   // The shared search (here.ts): a remembered point at once, a fresh one with a time limit, never an endless wait.
   const found=await locate({ask:'always',precise:true}),fix=found.fix;
   if(found.status==='blocked'){openLocationSettings();throw Error(tr('Разрешите доступ к геопозиции в настройках, чтобы мы вели вас по карте.'));}
   if(found.status==='denied'||found.status==='idle')throw Error(tr('Разрешите доступ к геопозиции, чтобы мы вели вас по карте.'));
   if(found.status==='off')throw Error(tr('Геолокация на телефоне выключена. Включите её и нажмите «Маршрут» ещё раз.'));
   if(!fix)throw Error(tr('Телефон пока не знает, где вы. Выйдите ближе к окну или на улицу и попробуйте ещё раз.'));
   // The server takes a position measured within the last minute: an older remembered one is not sent.
   if(Date.now()-fix.at>ROUTE_MAX_AGE)throw Error(tr('Телефон пока не уточнил, где вы. Выйдите ближе к окну или на улицу и нажмите «Маршрут» ещё раз.'));
   if(fix.accuracy>ROUTE_ACCURACY)throw Error(found.reduced?tr('Телефон даёт только примерное место. Включите «Точная геопозиция» для AiQonaq в настройках.'):tr('Телефон знает место только примерно. Выйдите на открытое место и попробуйте ещё раз.'));
   const pos=asPosition(fix);
   setHere({point:[pos.coords.longitude,pos.coords.latitude],accuracy:pos.coords.accuracy??50});setStatus('routing');
   await reroute(t,pos);
   stopWatch();watch.current=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:4000,distanceInterval:8},onPosition);
  }catch(e){stopWatch();await stopSharing();setStatus('idle');setTrip(null);setError(fail(e));}
 }
 async function finish(done:boolean){stopWatch();await stopSharing();if(done){setStatus('arrived');setRoute(null);}else{setStatus('idle');setTrip(null);setRoute(null);}}
 function close(){setStatus('idle');setTrip(null);setRoute(null);setHere(null);}
 useEffect(()=>()=>{stopWatch();void stopSharing();},[]);
 const state:NavState|null=route&&here?navState(route,here.point):null;
 return {trip,route,here,status,error,state,rerouted,start,stop:()=>finish(false),close,clearError:()=>setError('')};
}
export type TripControl=ReturnType<typeof useTrip>;

// What the sheet shows during a trip (concept of 2026-11-25, «В пути»): a coloured strip with the time and the way
// left and the next turn, the address large, and one row of three buttons as in a courier app (talabat): the deal, the
// chat with the owner and a call through the app (the number is not shown). For a cleaning the swipe «я на месте»,
// which tells the owner. Ending the route is a quiet link under it.
export function TripHead({nav,onOpen,address,detail,onArrived,onChat,onCall}:{nav:TripControl;onOpen:()=>void;address?:string;detail?:string;onArrived?:()=>Promise<unknown>|void;onChat?:()=>void;onCall?:()=>void}){
 const {trip,status,state}=nav;if(!trip)return null;
 const waiting=status==='locating'||status==='routing'||!state,there=status==='arrived';
 const strip=there?tr('Вы на месте'):status==='locating'?tr('Ищем вас на карте…'):waiting?tr('Строим маршрут…'):tr('Через {time} на месте · {left}',{time:minutesText(state.secondsLeft),left:distanceText(state.left)});
 const turn=!there&&!waiting?turnArrow(state.next)+'  '+distanceText(state.toNext)+' · '+(state.next?.text||tr('Двигайтесь по линии маршрута')):'';
 const button=(title:string,icon:MenuIcon,onPress:()=>void)=><Pressable key={title} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({pressed})=>[n.button,pressed&&n.pressed]}><Image source={menuIcons[icon]} style={n.icon} accessibilityElementsHidden importantForAccessibility="no"/><Text numberOfLines={1} style={n.buttonText}>{title}</Text></Pressable>;
 return <View style={n.card} accessibilityLiveRegion="polite">
  <View style={[n.strip,there&&n.stripThere]}><Text numberOfLines={1} style={n.stripText}>{strip}</Text>{!!turn&&<Text numberOfLines={1} style={n.turn}>{turn}</Text>}</View>
  <View style={n.body}>
   <View><Text numberOfLines={2} style={n.big}>{address||trip.title}</Text>
   {!!(detail||address)&&<Text numberOfLines={1} style={h.note}>{detail||trip.title}</Text>}</View>
   <View style={n.buttons}>{[button(trip.kind==='booking'?tr('Бронь'):tr('Задание'),'file',onOpen),onChat&&button(tr('Владелец'),'messages',onChat),onCall&&button(tr('Звонок'),'phone',onCall)]}</View>
   {!!onArrived&&<SwipeConfirm label={tr('Проведите: я на месте')} onConfirm={()=>void onArrived()}/>}
   <Pressable accessibilityRole="button" accessibilityLabel={there?tr('Закрыть маршрут'):tr('Завершить маршрут')} onPress={there?nav.close:()=>void nav.stop()} style={({pressed})=>[n.quiet,pressed&&n.pressed]}><Text style={n.quietText}>{there?tr('Закрыть маршрут'):tr('Завершить маршрут')}</Text></Pressable>
  </View>
 </View>;
}

const n=StyleSheet.create({
 wrap:{gap:12},row:{flexDirection:'row',alignItems:'center',gap:12},
 arrow:{width:T.control.primary,height:T.control.primary,borderRadius:T.radius.md,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},arrived:{backgroundColor:C.success},
 arrowText:{...type.heading,color:C.surface,fontWeight:'600'},big:{...type.title,color:C.ink,fontWeight:'600'},text:{...type.body,color:C.ink},
 card:{borderRadius:T.radius.xl,overflow:'hidden',backgroundColor:C.surface,borderWidth:1,borderColor:C.line},strip:{paddingHorizontal:16,paddingVertical:12,gap:2,backgroundColor:C.accent},stripThere:{backgroundColor:C.success},stripText:{...type.body,color:C.onAccent,fontWeight:'600'},turn:{...type.label,color:C.onAccent,opacity:.9},body:{padding:16,gap:12},buttons:{flexDirection:'row',gap:8},
 // Icon over the word, as a courier's buttons: three fit in a row on a narrow phone and in any language.
 button:{flex:1,minHeight:T.control.primary+8,paddingHorizontal:4,paddingVertical:8,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,alignItems:'center',justifyContent:'center',gap:4},
 icon:{width:20,height:20,tintColor:C.ink},buttonText:{...type.caption,color:C.ink,fontWeight:'600',textAlign:'center'},pressed:{opacity:.6},
 quiet:{minHeight:T.control.touch,alignItems:'center',justifyContent:'center',marginTop:-4},quietText:{...type.label,color:C.muted,fontWeight:'600'}
});
