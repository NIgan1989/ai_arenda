import React,{useEffect,useRef,type ReactNode} from 'react';
import {AccessibilityInfo,Animated,Easing,Platform} from 'react-native';
import {T} from './tokens';

// A page of the app comes in with a short fade and lift whenever the page changes. It does not remount the page.
export function PageTransition({page,children}:{page:string;children:ReactNode}){
  const shown=useRef(new Animated.Value(1)).current,first=useRef(true);
  useEffect(()=>{
    if(first.current){first.current=false;return;}
    let alive=true;
    AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(calm=>{
      if(!alive||calm)return;
      shown.setValue(0);
      Animated.timing(shown,{toValue:1,duration:T.motion.slow,easing:Easing.out(Easing.cubic),useNativeDriver:Platform.OS!=='web'}).start();
    });
    return()=>{alive=false;};
  },[page,shown]);
  return <Animated.View style={{flex:1,minHeight:0,opacity:shown,transform:[{translateY:shown.interpolate({inputRange:[0,1],outputRange:[10,0]})}]}}>{children}</Animated.View>;
}
