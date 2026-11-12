import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Image,PanResponder,Pressable,StyleSheet,Text,View,type LayoutChangeEvent} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {API_URL} from './api';
import {MAX_ZOOM,MIN_ZOOM,TILE,fitView,groupPins,pinWidth,project,unproject,validPoint,visibleTiles,type MapPoint} from './map-math';

// rank: among pins of one tone, the lower one stays visible when their boxes meet (the price, for flats).
export type MapPin={key:string;point:MapPoint;label:string;tone?:'home'|'pending'|'offer'|'job'|'booking';title?:string;rank?:number};
type Props={center:MapPoint;pins:MapPin[];selected?:string;onSelect?:(key:string)=>void;bottomInset?:number;topInset?:number;focusKey?:string;picking?:boolean;onCenter?:(center:MapPoint)=>void};
// The tile service asks clients to identify themselves; no account or device data is sent.
const tileHeaders={'User-Agent':'AIArenda-mobile/0.1 (+'+API_URL+')'};
const plusIcon=require('../assets/ui/plus.png'),minusIcon=require('../assets/ui/minus.png'),fitIcon=require('../assets/ui/fit.png');
// Three round controls on the right edge, centred on the visible part of the map.
const controlsHeight=3*T.control.touch+2*8;
// When pin boxes meet, one stays visible: the selected one, then an answering or waiting flat, then the cheapest.
const toneOrder={offer:0,pending:1,booking:2,job:3,home:3};
const tones={home:{bg:C.surface,fg:C.ink,line:C.line},pending:{bg:C.warningSoft,fg:C.warning,line:C.warningLine},offer:{bg:C.accent,fg:C.surface,line:C.accent},job:{bg:C.infoSoft,fg:C.info,line:C.infoLine},booking:{bg:C.accentSoft,fg:C.ink,line:C.accentLine}};

export function TileMap({center,pins,selected,onSelect,bottomInset=0,topInset=0,focusKey='',picking=false,onCenter}:Props){
 const [size,setSize]=useState({w:0,h:0}),[view,setView]=useState<{center:MapPoint;zoom:number}>({center,zoom:12}),[drag,setDrag]=useState({x:0,y:0}),[still,setStill]=useState(false);
 const state=useRef({view,size,bottomInset,topInset});state.current={view,size,bottomInset,topInset};
 const pulse=useRef(new Animated.Value(0)).current,report=useRef(onCenter);report.current=onCenter;
 const usableHeight=Math.max(120,size.h-bottomInset-topInset),originY=topInset+usableHeight/2;
 useEffect(()=>{let live=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(live)setStill(v);}).catch(()=>{});return()=>{live=false;};},[]);
 const hasPending=pins.some(p=>p.tone==='pending');
 useEffect(()=>{if(still||!hasPending){pulse.setValue(0);return;}const loop=Animated.loop(Animated.timing(pulse,{toValue:1,duration:1600,useNativeDriver:true}));loop.start();return()=>loop.stop();},[still,hasPending,pulse]);
 // Reframe only when the caller announces a new set of results, never on background refreshes.
 const fitted=useRef(''),fittedHeight=useRef(0),moved=useRef(false);
 const fit=()=>{
  const points=pins.map(p=>p.point).filter(p=>validPoint(p)),next=points.length?fitView(points,size.w-96,usableHeight-96,15):null;
  moved.current=false;fittedHeight.current=usableHeight;
  setView(next||{center:validPoint(center)||[76.95,52.287],zoom:12});
 };
 useEffect(()=>{
  if(!size.w||fitted.current===focusKey+':'+size.w)return;fitted.current=focusKey+':'+size.w;
  fit();
 },[focusKey,size.w]);
 // The sheet grew or shrank: frame the same pins in the part of the map that is still visible, unless the person has moved the map themselves.
 useEffect(()=>{if(!size.w||!fitted.current||moved.current||picking)return;if(Math.abs(usableHeight-fittedHeight.current)>=48)fit();},[usableHeight]);
 useEffect(()=>{report.current?.(view.center);},[view.center[0],view.center[1]]);
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)+Math.abs(g.dy)>6,
  onPanResponderMove:(_e,g)=>setDrag({x:g.dx,y:g.dy}),
  onPanResponderRelease:(_e,g)=>{const {view:v}=state.current,c=project(v.center,v.zoom);moved.current=true;setDrag({x:0,y:0});setView({zoom:v.zoom,center:unproject(c.x-g.dx,c.y-g.dy,v.zoom)});},
  onPanResponderTerminate:()=>setDrag({x:0,y:0})
 }),[]);
 const zoomBy=(delta:number)=>{moved.current=true;setView(v=>({...v,zoom:Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,v.zoom+delta))}));};
 const layout=(e:LayoutChangeEvent)=>{const {width,height}=e.nativeEvent.layout;if(Math.round(width)!==size.w||Math.round(height)!==size.h)setSize({w:Math.round(width),h:Math.round(height)});};
 const tiles=size.w?visibleTiles(view.center,view.zoom,size.w+2*TILE,size.h+2*TILE,originY+TILE).map(t=>({...t,left:t.left-TILE,top:t.top-TILE})):[],c=project(view.center,view.zoom);
 const placed=size.w?pins.flatMap(pin=>{if(!validPoint(pin.point))return [];const p=project(pin.point,view.zoom);return [{pin,x:p.x-c.x+size.w/2,y:p.y-c.y+originY}];}).filter(p=>p.x>-80&&p.x<size.w+80&&p.y>-40&&p.y<size.h+40):[];
 // Boxes that would cover each other are drawn as one pin with "+N"; a tap on it zooms in until they part.
 const byKey=new Map(placed.map(p=>[p.pin.key,p]));
 const shown=groupPins(placed.map(({pin,x,y})=>({key:pin.key,x,y,width:pinWidth(pin.label),height:32,rank:pin.key===selected?-1:toneOrder[pin.tone||'home']*1e9+Math.max(0,Math.min(pin.rank??0,1e9-1))}))).map(g=>({...byKey.get(g.key)!,members:g.members}));
 const openGroup=(keys:string[])=>{
  const {view:v}=state.current;
  // At the closest zoom the flats share one spot: each tap shows the next one.
  if(v.zoom>=MAX_ZOOM){onSelect?.(keys[(keys.indexOf(selected||'')+1)%keys.length]);return;}
  const next=fitView(keys.map(key=>byKey.get(key)!.pin.point),size.w-96,usableHeight-96,MAX_ZOOM);
  moved.current=true;setView({center:next?.center||v.center,zoom:Math.min(MAX_ZOOM,Math.max(v.zoom+1,Math.min(next?.zoom??v.zoom+1,v.zoom+2)))});
 };
 return <View style={m.host} onLayout={layout} accessibilityLabel={'Карта. Меток на экране: '+placed.length}>
  <View style={[StyleSheet.absoluteFill,{transform:[{translateX:drag.x},{translateY:drag.y}]}]} {...pan.panHandlers}>
   {tiles.map(t=><Image key={t.key} fadeDuration={0} accessibilityIgnoresInvertColors source={{uri:'https://tile.openstreetmap.org/'+view.zoom+'/'+t.x+'/'+t.y+'.png',headers:tileHeaders}} style={[m.tile,{left:t.left,top:t.top}]}/>)}
   {shown.map(({pin,x,y,members})=>{const tone=tones[pin.tone||'home'],active=pin.key===selected,more=members.length-1;
    return <View key={pin.key} pointerEvents="box-none" style={[m.pinWrap,{left:x-90,top:y-20,zIndex:active?3:pin.tone==='offer'?2:1}]}>
     {pin.tone==='pending'&&!still&&<Animated.View pointerEvents="none" style={[m.ring,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.55,0]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.6,1.9]})}]}]}/>}
     <Pressable accessibilityRole="button" accessibilityLabel={(pin.title||'Метка')+', '+pin.label+(more?'. Рядом ещё '+more+'. Приблизить':'')} accessibilityState={{selected:active}} disabled={picking||!onSelect} onPress={()=>more?openGroup(members):onSelect?.(pin.key)} hitSlop={6} style={[m.pin,{backgroundColor:active?C.ink:tone.bg,borderColor:active?C.ink:tone.line}]}><Text numberOfLines={1} style={[m.pinText,{color:active?C.surface:tone.fg}]}>{pin.label}{more?<Text style={m.pinMore}>{' +'+more}</Text>:null}</Text></Pressable>
    </View>;})}
  </View>
  {picking&&<View pointerEvents="none" style={[m.cross,{left:size.w/2-14,top:originY-28}]}><View style={m.crossHead}/><View style={m.crossStem}/></View>}
  <View style={[m.controls,{top:Math.max(topInset+12,Math.round(originY-controlsHeight/2))}]}>
   <Pressable accessibilityRole="button" accessibilityLabel="Приблизить" disabled={view.zoom>=MAX_ZOOM} onPress={()=>zoomBy(1)} style={m.control}><Image source={plusIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Отдалить" disabled={view.zoom<=MIN_ZOOM} onPress={()=>zoomBy(-1)} style={m.control}><Image source={minusIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Показать всё на карте" onPress={fit} style={m.control}><Image source={fitIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
  </View>
  <Text style={[m.credit,{bottom:bottomInset+6}]}>© OpenStreetMap</Text>
 </View>;
}
const m=StyleSheet.create({
 host:{flex:1,backgroundColor:C.line,overflow:'hidden'},tile:{position:'absolute',width:TILE,height:TILE},
 pinWrap:{position:'absolute',width:180,height:40,alignItems:'center',justifyContent:'center'},
 pin:{minHeight:32,minWidth:44,paddingHorizontal:12,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 pinText:{fontSize:14,fontWeight:'600'},pinMore:{fontWeight:'500',opacity:.7},ring:{position:'absolute',width:56,height:56,borderRadius:999,backgroundColor:C.warningLine},
 cross:{position:'absolute',width:28,alignItems:'center'},crossHead:{width:24,height:24,borderRadius:12,backgroundColor:C.accent,borderWidth:4,borderColor:C.surface},crossStem:{width:3,height:10,backgroundColor:C.accent},
 controls:{position:'absolute',right:12,gap:8},control:{width:44,height:44,borderRadius:T.radius.full,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3},controlIcon:{width:20,height:20,tintColor:C.ink},
 credit:{position:'absolute',left:8,fontSize:12,color:C.inkSoft,backgroundColor:'rgba(255,255,255,0.75)',paddingHorizontal:4,borderRadius:4}
});
