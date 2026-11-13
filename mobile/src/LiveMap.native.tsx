import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Image,Pressable,StyleSheet,Text,View,type LayoutChangeEvent,type NativeSyntheticEvent} from 'react-native';
import {Camera,Map as GlMap,Marker,type CameraRef,type ViewStateChangeEvent} from '@maplibre/maplibre-react-native';
import {MAX_ZOOM,MIN_ZOOM,fitView,groupPins,pinWidth,project,validPoint,type MapPoint} from './map-math';
import {appearDelay} from './map-motion';
import {FRESH,LEAVE,Leaving,Pin,Radar,controlsHeight,m,toneOrder} from './MapPins';
import type {MapPin} from './TileMap';

// The home map on a phone: MapLibre with the same OpenFreeMap style as the site, so both look alike and the vector map
// can tilt, fly and draw layers (heat, routes) in the next stages of the live map. The pins are the same React views as
// in the web preview (MapPins.tsx) and keep all their events; MapLibre only carries them with the map.
export type {MapPin};
type Props={center:MapPoint;pins:MapPin[];selected?:string;onSelect?:(key:string)=>void;bottomInset?:number;topInset?:number;focusKey?:string;picking?:boolean;scanning?:boolean;onCenter?:(center:MapPoint)=>void};
const STYLE='https://tiles.openfreemap.org/styles/positron';
// MapLibre counts zoom for 512px tiles, map-math for 256px ones: the same picture is one level lower here.
const toGl=(zoom:number)=>zoom-1,fromGl=(zoom:number)=>zoom+1;
const plusIcon=require('../assets/ui/plus.png'),minusIcon=require('../assets/ui/minus.png'),fitIcon=require('../assets/ui/fit.png');
const fallback:MapPoint=[76.95,52.287];

export function LiveMap({center,pins,selected,onSelect,bottomInset=0,topInset=0,focusKey='',picking=false,scanning=false,onCenter}:Props){
 const camera=useRef<CameraRef>(null);
 const [size,setSize]=useState({w:0,h:0}),[still,setStill]=useState(false),[failed,setFailed]=useState(false);
 // The view as the map last reported it, in map-math zoom; pins are grouped by it.
 const [view,setView]=useState<{center:MapPoint;zoom:number}>({center:validPoint(center)||fallback,zoom:12});
 const live=useRef({view,size,still});live.current={view,size,still};
 const loop=useRef(new Animated.Value(0)).current,report=useRef(onCenter);report.current=onCenter;
 const usableHeight=Math.max(120,size.h-bottomInset-topInset),originY=topInset+usableHeight/2;
 const padding={top:topInset,bottom:bottomInset,left:0,right:0};
 useEffect(()=>{let on=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(on)setStill(v);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener?.('reduceMotionChanged',v=>setStill(v));return()=>{on=false;sub?.remove();};},[]);
 const breathing=pins.some(p=>p.tone==='pending'||p.tone==='active');
 useEffect(()=>{if(still||!breathing){loop.setValue(0);return;}const l=Animated.loop(Animated.timing(loop,{toValue:1,duration:1600,useNativeDriver:true}));l.start();return()=>l.stop();},[still,breathing,loop]);

 // ---------- The camera: every move the person did not make flies along an arc ----------
 // Longer trips last longer, from 400 to 1400 ms, as on the site; with «reduce motion» the map jumps.
 const flyTo=(to:{center:MapPoint;zoom:number},instant=false)=>{
  const {view:v,still:calm}=live.current,z=fromGl(toGl(v.zoom)),a=project(v.center,z),b=project(to.center,z);
  const far=Math.hypot(b.x-a.x,b.y-a.y),duration=instant||calm?0:Math.round(Math.min(1400,400+far*.9+Math.abs(to.zoom-v.zoom)*120));
  camera.current?.flyTo({center:to.center,zoom:toGl(to.zoom),padding,duration,easing:duration?'fly':undefined});
 };
 // Reframe only when the caller announces a new set of results, never on background refreshes.
 const fitted=useRef(''),fittedHeight=useRef(0),moved=useRef(false),first=useRef(true);
 const fit=()=>{
  const points=pins.map(p=>p.point).filter(p=>validPoint(p)),next=points.length?fitView(points,size.w-96,usableHeight-96,15):null;
  moved.current=false;fittedHeight.current=usableHeight;
  flyTo(next||{center:validPoint(center)||fallback,zoom:12},first.current);first.current=false;
 };
 useEffect(()=>{if(!size.w||fitted.current===focusKey+':'+size.w)return;fitted.current=focusKey+':'+size.w;fit();},[focusKey,size.w]);
 // The sheet grew or shrank: frame the same pins in what is still visible, unless the person moved the map.
 useEffect(()=>{if(!size.w||!fitted.current||moved.current||picking)return;if(Math.abs(usableHeight-fittedHeight.current)>=48)fit();},[usableHeight]);
 const zoomBy=(delta:number)=>{moved.current=true;flyTo({center:view.center,zoom:Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,view.zoom+delta))});};

 // ---------- Picking a point: the marker lifts while the map moves under it and lands with a ring ----------
 const lift=useRef(new Animated.Value(0)).current,land=useRef(new Animated.Value(1)).current;
 const raise=(up:boolean)=>{if(!picking||still)return;Animated.spring(lift,{toValue:up?1:0,friction:5,tension:120,useNativeDriver:true}).start();if(!up){land.setValue(0);Animated.timing(land,{toValue:1,duration:600,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();}};
 const willChange=(e:NativeSyntheticEvent<ViewStateChangeEvent>)=>{if(e.nativeEvent.userInteraction){moved.current=true;raise(true);}};
 const didChange=(e:NativeSyntheticEvent<ViewStateChangeEvent>)=>{
  const c=validPoint(e.nativeEvent.center as MapPoint);if(!c)return;
  setView({center:c,zoom:fromGl(e.nativeEvent.zoom)});report.current?.(c);if(e.nativeEvent.userInteraction)raise(false);
 };

 // ---------- Arrivals and departures of pins ----------
 const born=useRef(new Map<string,number>()),known=useRef(new Map<string,MapPin>()),[leaving,setLeaving]=useState<(MapPin&{gone:number})[]>([]);
 const arrived=useMemo(()=>{
  const now=Date.now(),next=new Map(pins.map(p=>[p.key,p])),gone:MapPin[]=[];
  for(const p of pins)if(!known.current.has(p.key))born.current.set(p.key,now);
  for(const [key,p] of known.current)if(!next.has(key)){gone.push(p);born.current.delete(key);}
  known.current=next;return gone;
 },[pins]);
 const timers=useRef(new Set<ReturnType<typeof setTimeout>>());
 useEffect(()=>()=>{timers.current.forEach(clearTimeout);timers.current.clear();},[]);
 useEffect(()=>{
  setLeaving(l=>l.filter(p=>!pins.some(n=>n.key===p.key)));
  if(still||!arrived.length)return;const gone=Date.now(),batch=arrived.map(p=>({...p,gone}));
  setLeaving(l=>[...l.filter(p=>!arrived.some(a=>a.key===p.key)),...batch]);
  const timer=setTimeout(()=>{timers.current.delete(timer);setLeaving(l=>l.filter(p=>!batch.includes(p)));},LEAVE+40);timers.current.add(timer);
 },[arrived]);

 // Pins whose boxes would meet at this zoom are drawn as one with "+N"; a tap on it flies in until they part.
 const c=project(view.center,view.zoom),at=(point:MapPoint)=>{const p=project(point,view.zoom);return {x:p.x-c.x,y:p.y-c.y};};
 const placed=pins.flatMap(pin=>validPoint(pin.point)?[{pin,...at(pin.point)}]:[]);
 const byKey=new Map(placed.map(p=>[p.pin.key,p]));
 const shown=groupPins(placed.map(({pin,x,y})=>({key:pin.key,x,y,width:pinWidth(pin.label),height:32,rank:pin.key===selected?-1:toneOrder[pin.tone||'home']*1e9+Math.max(0,Math.min(pin.rank??0,1e9-1))}))).map(g=>({...byKey.get(g.key)!,members:g.members}));
 const openGroup=(keys:string[])=>{
  if(view.zoom>=MAX_ZOOM){onSelect?.(keys[(keys.indexOf(selected||'')+1)%keys.length]);return;}
  const next=fitView(keys.map(key=>byKey.get(key)!.pin.point),size.w-96,usableHeight-96,MAX_ZOOM);
  moved.current=true;flyTo({center:next?.center||view.center,zoom:Math.min(MAX_ZOOM,Math.max(view.zoom+1,Math.min(next?.zoom??view.zoom+1,view.zoom+2)))});
 };
 const layout=(e:LayoutChangeEvent)=>{const {width,height}=e.nativeEvent.layout;if(Math.round(width)!==size.w||Math.round(height)!==size.h)setSize({w:Math.round(width),h:Math.round(height)});};
 const now=Date.now(),start=validPoint(center)||fallback;
 return <View style={m.host} onLayout={layout} accessibilityLabel={'Карта. Меток: '+placed.length}>
  <GlMap style={StyleSheet.absoluteFill} mapStyle={STYLE} logo={false} compass={false} touchRotate={false} touchPitch={false} attribution attributionPosition={{bottom:bottomInset+6,left:8}}
   onRegionWillChange={willChange} onRegionDidChange={didChange} onDidFailLoadingMap={()=>setFailed(true)} onDidFinishLoadingMap={()=>setFailed(false)}>
   <Camera ref={camera} initialViewState={{center:start,zoom:toGl(12)}} minZoom={toGl(MIN_ZOOM)} maxZoom={toGl(MAX_ZOOM)}/>
   {!still&&leaving.filter(p=>validPoint(p.point)).map(p=><Marker key={'gone:'+p.key+':'+p.gone} id={'gone:'+p.key+':'+p.gone} lngLat={p.point} anchor="center"><Leaving pin={p}/></Marker>)}
   {shown.map(({pin,x,y,members})=>{const more=members.length-1,b=born.current.get(pin.key)||0;
    return <Marker key={pin.key} id={pin.key} lngLat={pin.point} anchor="center">
     <Pin pin={pin} more={more} active={pin.key===selected} still={still} picking={picking} loop={loop}
      born={now-b<FRESH?b:0} delay={appearDelay(x,y,0,0)} onPress={onSelect?()=>more?openGroup(members):onSelect(pin.key):undefined}/>
    </Marker>;})}
  </GlMap>
  {scanning&&!still&&size.w>0&&<View pointerEvents="none" style={StyleSheet.absoluteFill}><Radar x={size.w/2} y={originY}/></View>}
  {picking&&<View pointerEvents="none" style={[m.cross,{left:size.w/2-28,top:originY-28}]}>
   <Animated.View style={[m.landing,{opacity:land.interpolate({inputRange:[0,1],outputRange:[.6,0]}),transform:[{scale:land.interpolate({inputRange:[0,1],outputRange:[.2,1.4]})}]}]}/>
   <Animated.View style={[m.crossShadow,{opacity:lift.interpolate({inputRange:[0,1],outputRange:[.25,.12]}),transform:[{scale:lift.interpolate({inputRange:[0,1],outputRange:[1,.6]})}]}]}/>
   <Animated.View style={{alignItems:'center',position:'absolute',bottom:28,transform:[{translateY:lift.interpolate({inputRange:[0,1],outputRange:[0,-14]})}]}}><View style={m.crossHead}/><View style={m.crossStem}/></Animated.View>
  </View>}
  <View style={[m.controls,{top:Math.max(topInset+12,Math.round(originY-controlsHeight/2))}]}>
   <Pressable accessibilityRole="button" accessibilityLabel="Приблизить" disabled={view.zoom>=MAX_ZOOM} onPress={()=>zoomBy(1)} style={m.control}><Image source={plusIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Отдалить" disabled={view.zoom<=MIN_ZOOM} onPress={()=>zoomBy(-1)} style={m.control}><Image source={minusIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Показать всё на карте" onPress={fit} style={m.control}><Image source={fitIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
  </View>
  {failed&&<Text accessibilityLiveRegion="polite" style={[m.credit,{bottom:bottomInset+30}]}>Карта временно не загружается. Список и действия работают.</Text>}
 </View>;
}
