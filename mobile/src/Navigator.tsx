import React,{useEffect,useRef,useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import * as Location from 'expo-location';
import {request} from './api';
import {C,type} from './styles';
import {T} from './tokens';
import {Action,h} from './SheetParts';
import {arrived,distanceText,minutesText,navState,offRoute,turnArrow,type NavRoute,type NavState} from './navigation';
import type {MapPoint} from './map-math';

// Navigation on our own map, like a taxi app: the road route from where the person is to the object,
// their point on the map, the next turn and what is left. The route comes from our server (Stadia Maps or the test router);
// while the trip lasts the owner sees the cleaner's point, as the cleaner agreed by tapping «Поехали».
// A guest only asks for the way: their point is not shared with the owner.
export type Trip={kind:'job'|'booking';id:string;title:string;target:MapPoint};
type Status='idle'|'locating'|'routing'|'driving'|'arrived';
const REROUTE_AFTER=30000,POINT_EVERY=5000;
const fail=(e:unknown)=>e instanceof Error&&e.message?e.message:'Не удалось построить маршрут. Попробуйте ещё раз.';

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
  const point:MapPoint=[pos.coords.longitude,pos.coords.latitude],accuracy=pos.coords.accuracy??50;setHere({point,accuracy});
  if(arrived(point,t.target)){void finish(true);return;}
  const r=live.current.route;
  if(r&&offRoute(navState(r,point),accuracy)&&Date.now()-lastRoute.current>REROUTE_AFTER)void reroute(t,pos).catch(e=>setError(fail(e)));
  if(sharing.current&&accuracy<=500&&Date.now()-lastPoint.current>=POINT_EVERY){lastPoint.current=Date.now();void request('/api/operations/map/journey/point',{id:sharing.current,longitude:point[0],latitude:point[1],accuracy:Math.round(accuracy),recordedAt:stamp(pos.timestamp)},undefined,undefined,role).catch(()=>{});}
 }
 async function start(t:Trip){
  setTrip(t);live.current.trip=t;setRoute(null);setError('');setStatus('locating');
  try{
   const permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=='granted')throw Error('Разрешите доступ к геопозиции, чтобы мы вели вас по карте.');
   const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
   if((pos.coords.accuracy??0)>500)throw Error('Телефон пока не знает, где вы. Выйдите на открытое место и попробуйте ещё раз.');
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

// What the sheet shows during a trip, instead of the AI line: the turn ahead, what is left, and the way out.
export function TripHead({nav,onOpen}:{nav:TripControl;onOpen:()=>void}){
 const {trip,status,state}=nav;if(!trip)return null;
 if(status==='arrived')return <View style={n.wrap}>
  <View style={n.row}><View style={[n.arrow,n.arrived]}><Text style={n.arrowText}>⚑</Text></View><View style={h.grow}><Text style={n.big}>Вы на месте</Text><Text numberOfLines={1} style={h.note}>{trip.title}</Text></View></View>
  <Action title={trip.kind==='booking'?'Открыть бронь':'Открыть задание'} onPress={onOpen}/><Action secondary title="Закрыть" onPress={nav.close}/>
 </View>;
 const waiting=status==='locating'||status==='routing'||!state;
 return <View style={n.wrap} accessibilityLiveRegion="polite">
  <View style={n.row}>
   <View style={n.arrow}><Text style={n.arrowText}>{waiting?'…':turnArrow(state.next)}</Text></View>
   <View style={h.grow}>
    <Text style={n.big}>{status==='locating'?'Ищем вас на карте…':waiting?'Строим маршрут…':distanceText(state.toNext)}</Text>
    <Text numberOfLines={2} style={n.text}>{waiting?trip.title:state.next?.text||'Двигайтесь по линии маршрута'}</Text>
   </View>
  </View>
  {!waiting&&<Text numberOfLines={1} style={h.note}>Осталось {distanceText(state.left)} · {minutesText(state.secondsLeft)} · {trip.title}</Text>}
  <Action secondary title="Завершить поездку" onPress={()=>void nav.stop()}/>
 </View>;
}

const n=StyleSheet.create({
 wrap:{gap:12},row:{flexDirection:'row',alignItems:'center',gap:12},
 arrow:{width:T.control.primary,height:T.control.primary,borderRadius:T.radius.md,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},arrived:{backgroundColor:C.success},
 arrowText:{...type.heading,color:C.surface,fontWeight:'700'},big:{...type.heading,color:C.ink,fontWeight:'700'},text:{...type.body,color:C.ink}
});
