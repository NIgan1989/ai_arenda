import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Image,Modal,PanResponder,Platform,Pressable,StatusBar,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {C} from './styles';
import {SafeAreaProvider,useSafeAreaInsets} from 'react-native-safe-area-context';

// A photo opened from a chat: over the whole screen on black, at its own proportions, with a close button that is always
// visible, a swipe up or down that closes it, «Назад» on Android, a two finger pinch and a double tap that zoom.
// Built on PanResponder only, so the app needs no new native module.

export type Size={width:number;height:number};
const MAX=4,DOUBLE=2.5;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
// The largest box of the photo's proportions that fits into the given one.
export function fit(photo:Size|null|undefined,box:Size):Size{
 const w=photo?.width||4,h=photo?.height||3,k=Math.min(box.width/w,box.height/h);
 return {width:Math.round(w*k),height:Math.round(h*k)};
}
// The size of a photo in a chat bubble: full width of the bubble, its own proportions, but never a thin strip nor a tower.
export function bubbleSize(photo:Size|null|undefined,maxWidth:number):Size{
 const ratio=clamp((photo?.width||4)/(photo?.height||3),.62,1.9),width=Math.round(maxWidth);
 return {width,height:Math.round(clamp(width/ratio,120,Math.round(maxWidth*1.35)))};
}
// Sizes of photos already measured, so a bubble keeps its shape when the list redraws it.
const sizes=new Map<string,Size>();
export function usePhotoSize(uri:string,known?:Size|null){
 const [size,setSize]=useState<Size|null>(known||sizes.get(uri)||null);
 useEffect(()=>{
  if(known?.width){setSize(known);return;}
  if(!uri)return;const cached=sizes.get(uri);if(cached){setSize(cached);return;}
  let live=true;Image.getSize(uri,(width,height)=>{if(!width||!height)return;const value={width,height};if(sizes.size>200)sizes.clear();sizes.set(uri,value);if(live)setSize(value);},()=>{});
  return()=>{live=false;};
 },[uri,known?.width,known?.height]);
 return size;
}

type Props={uri:string;visible:boolean;onClose:()=>void;size?:Size|null;title?:string;caption?:string};
export function PhotoViewer(props:Props){
 return <Modal visible={props.visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait','landscape']} onRequestClose={props.onClose}>
  {props.visible&&<SafeAreaProvider><Viewer {...props}/></SafeAreaProvider>}
 </Modal>;
}

function Viewer({uri,onClose,size:known,title,caption}:Props){
 // The viewer's own area as laid out, so the photo is centred even where the window and the modal differ.
 const screen=useWindowDimensions(),[area,setArea]=useState<Size|null>(null),window=area||screen,insets=useSafeAreaInsets(),size=usePhotoSize(uri,known),box=fit(size,window);
 const [chrome,setChrome]=useState(true),[reduce,setReduce]=useState(false),[failed,setFailed]=useState(false);
 const scale=useRef(new Animated.Value(1)).current,x=useRef(new Animated.Value(0)).current,y=useRef(new Animated.Value(0)).current,drop=useRef(new Animated.Value(0)).current;
 // The gesture's own numbers. The view is moved by translate, then scaled around its centre.
 const g=useRef({scale:1,x:0,y:0,mode:'' as ''|'drop'|'pan'|'pinch',from:{scale:1,x:0,y:0,px:0,py:0,dist:1},start:0,moved:0,multi:false,lastTap:0,tapTimer:null as any,closing:false}).current;
 const view=useRef({window,box,reduce,onClose}).current;view.window=window;view.box=box;view.reduce=reduce;view.onClose=onClose;
 useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);return()=>clearTimeout(g.tapTimer);},[]);
 // How far the photo may move at this zoom so that its edge never leaves the screen's edge.
 const bounds=(s:number)=>({x:Math.max(0,(view.box.width*s-view.window.width)/2),y:Math.max(0,(view.box.height*s-view.window.height)/2)});
 function settle(s:number,nx:number,ny:number,animated=true){
  const k=clamp(s,1,MAX),b=bounds(k),tx=clamp(nx,-b.x,b.x),ty=clamp(ny,-b.y,b.y);g.scale=k;g.x=tx;g.y=ty;
  if(!animated||view.reduce){scale.setValue(k);x.setValue(tx);y.setValue(ty);return;}
  Animated.parallel([Animated.spring(scale,{toValue:k,useNativeDriver:true,bounciness:0,speed:18}),Animated.spring(x,{toValue:tx,useNativeDriver:true,bounciness:0,speed:18}),Animated.spring(y,{toValue:ty,useNativeDriver:true,bounciness:0,speed:18})]).start();
 }
 function close(direction=0){
  if(g.closing)return;g.closing=true;
  if(!direction||view.reduce){view.onClose();return;}
  Animated.timing(drop,{toValue:direction*view.window.height,duration:180,useNativeDriver:true}).start(()=>view.onClose());
 }
 // A double tap zooms in on the tapped point, or back out.
 function zoomAt(px:number,py:number){
  if(g.scale>1.05){settle(1,0,0);return;}
  const cx=view.window.width/2,cy=view.window.height/2;settle(DOUBLE,(px-cx)*(1-DOUBLE),(py-cy)*(1-DOUBLE));
 }
 const begin=(touches:any[])=>{
  const [a,b]=touches;g.from={scale:g.scale,x:g.x,y:g.y,px:a.pageX,py:a.pageY,dist:1};
  if(b){g.mode='pinch';g.from.px=(a.pageX+b.pageX)/2;g.from.py=(a.pageY+b.pageY)/2;g.from.dist=Math.max(1,Math.hypot(a.pageX-b.pageX,a.pageY-b.pageY));}
  else g.mode=g.scale>1.01?'pan':'drop';
 };
 const responder=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderTerminationRequest:()=>false,onShouldBlockNativeResponder:()=>true,
  onPanResponderGrant:e=>{g.start=Date.now();g.moved=0;g.multi=e.nativeEvent.touches.length>1;begin(e.nativeEvent.touches as any);},
  onPanResponderMove:(e,s)=>{
   const touches=e.nativeEvent.touches as any[];if(!touches.length)return;
   if(touches.length>1)g.multi=true;
   const want=touches.length>1?'pinch':g.scale>1.01?'pan':'drop';
   // A finger added or lifted mid gesture: carry on from where the photo is now.
   if(want!==g.mode&&!(g.mode==='drop'&&want==='pan'))begin(touches);
   g.moved=Math.max(g.moved,Math.abs(s.dx),Math.abs(s.dy));
   const [a,b]=touches;
   if(g.mode==='pinch'&&b){
    const px=(a.pageX+b.pageX)/2,py=(a.pageY+b.pageY)/2,dist=Math.max(1,Math.hypot(a.pageX-b.pageX,a.pageY-b.pageY));
    const k=clamp(g.from.scale*dist/g.from.dist,.7,MAX+1),cx=view.window.width/2,cy=view.window.height/2;
    // The point between the fingers stays under the fingers.
    const qx=(g.from.px-cx-g.from.x)/g.from.scale,qy=(g.from.py-cy-g.from.y)/g.from.scale;
    g.scale=k;g.x=px-cx-qx*k;g.y=py-cy-qy*k;scale.setValue(k);x.setValue(g.x);y.setValue(g.y);
   }else if(g.mode==='pan'){
    g.x=g.from.x+a.pageX-g.from.px;g.y=g.from.y+a.pageY-g.from.py;x.setValue(g.x);y.setValue(g.y);
   }else if(g.mode==='drop')drop.setValue(a.pageY-g.from.py);
  },
  onPanResponderRelease:(_e,s)=>{
   const mode=g.mode;g.mode='';
   // A gesture with two fingers is never a tap, even a quick pinch whose centre stayed still: it always settles.
   if(!g.multi&&g.moved<10&&Date.now()-g.start<300){
    const now=Date.now();
    if(now-g.lastTap<300){clearTimeout(g.tapTimer);g.lastTap=0;zoomAt(s.x0,s.y0);}
    else{g.lastTap=now;clearTimeout(g.tapTimer);g.tapTimer=setTimeout(()=>setChrome(v=>!v),300);}
    if(mode==='drop')drop.setValue(0);return;
   }
   if(mode==='drop'){
    const dy=s.dy;if(Math.abs(dy)>110||Math.abs(s.vy)>1.1)close(dy<0?-1:1);
    else if(view.reduce)drop.setValue(0);else Animated.spring(drop,{toValue:0,useNativeDriver:true,bounciness:0,speed:20}).start();
    return;
   }
   settle(g.scale,g.x,g.y);
  },
  onPanResponderTerminate:()=>{g.mode='';drop.setValue(0);settle(g.scale,g.x,g.y);},
 })).current;
 const fade=drop.interpolate({inputRange:[-400,0,400],outputRange:[.25,1,.25],extrapolate:'clamp'});
 return <View style={v.root} onLayout={e=>{const {width,height}=e.nativeEvent.layout;if(width&&height)setArea({width,height});}} accessibilityViewIsModal onAccessibilityEscape={()=>close()}>
  {Platform.OS!=='web'&&<StatusBar barStyle="light-content" animated/>}
  <Animated.View style={[StyleSheet.absoluteFill,v.backdrop,{opacity:fade}]}/>
  <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
   <Animated.View style={[v.stage,{transform:[{translateY:drop}]}]}>
    {failed?<Text style={v.failed}>{t('Не удалось открыть фото')}</Text>:<Animated.Image source={{uri}} accessibilityLabel={caption||t('Фотография сообщения')} resizeMode="contain" onError={()=>setFailed(true)} style={{width:box.width,height:box.height,transform:[{translateX:x},{translateY:y},{scale}]}}/>}
   </Animated.View>
  </View>
  {chrome&&<View pointerEvents="box-none" style={[v.top,{paddingTop:Math.max(insets.top,12)+4,paddingLeft:Math.max(insets.left,12),paddingRight:Math.max(insets.right,12)}]}>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть фото')} hitSlop={8} onPress={()=>close()} style={({pressed})=>[v.close,pressed&&v.pressed]}><View style={[v.cross,{transform:[{rotate:'45deg'}]}]}/><View style={[v.cross,{transform:[{rotate:'-45deg'}]}]}/></Pressable>
   {!!title&&<Text numberOfLines={1} style={v.title}>{title}</Text>}
  </View>}
  {chrome&&!!caption&&<View pointerEvents="none" style={[v.bottom,{paddingBottom:Math.max(insets.bottom,12)+8,paddingLeft:Math.max(insets.left,16),paddingRight:Math.max(insets.right,16)}]}><Text numberOfLines={4} style={v.caption}>{caption}</Text></View>}
 </View>;
}

const v=StyleSheet.create({
 root:{flex:1},backdrop:{backgroundColor:C.ink},stage:{flex:1,alignItems:'center',justifyContent:'center'},
 top:{position:'absolute',left:0,right:0,top:0,flexDirection:'row',alignItems:'center',gap:12,paddingBottom:8,backgroundColor:'rgba(0,0,0,0.35)'},
 close:{width:44,height:44,borderRadius:24,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center'},
 cross:{position:'absolute',width:20,height:2,borderRadius:1,backgroundColor:C.onAccent},pressed:{opacity:.6},
 title:{flex:1,color:C.onAccent,fontSize:16,lineHeight:20,fontWeight:'600'},
 bottom:{position:'absolute',left:0,right:0,bottom:0,paddingTop:12,backgroundColor:'rgba(0,0,0,0.45)'},
 caption:{color:C.onAccent,fontSize:16,lineHeight:24},failed:{color:C.onAccent,fontSize:16},
});
