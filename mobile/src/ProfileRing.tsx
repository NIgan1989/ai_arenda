import React from 'react';
import {Image,Pressable,View} from 'react-native';
import {C} from './styles';
import {Photo} from './ListingMedia';
import {menuIcons} from './AccountRows';

// The avatar at the top of the menu, as on the site (components/account-control.tsx, .acct-avatar): the photo or the
// initials inside a ring that fills as the profile is filled, and a camera badge to change the photo.
// The ring is two halves: each half window shows a half ring turned to the progress (no SVG library in the app).
const SIZE=72,STROKE=4,PHOTO=56;
function Half({side,turn,ink}:{side:'right'|'left';turn:number;ink:string}){
 return <View style={{position:'absolute',top:0,left:side==='right'?SIZE/2:0,width:SIZE/2,height:SIZE,overflow:'hidden'}}>
  <View style={{position:'absolute',top:0,left:side==='right'?-SIZE/2:0,width:SIZE,height:SIZE,borderRadius:SIZE/2,borderWidth:STROKE,borderColor:'transparent',borderTopColor:ink,borderRightColor:ink,transform:[{rotate:turn+'deg'}]}}/>
 </View>;
}
export function ProfileRing({photoId,name,progress,ink,onPress}:{photoId?:string|null;name?:string;progress:number;ink:string;onPress:()=>void}){
 const p=Math.max(0,Math.min(1,progress)),turn=360*p-135;
 return <Pressable accessibilityRole="button" accessibilityLabel="Изменить фото профиля" onPress={onPress} style={{width:SIZE,height:SIZE}}>
  <View style={{position:'absolute',inset:0,borderRadius:SIZE/2,borderWidth:STROKE,borderColor:C.line} as any}/>
  {p>0&&<Half side="right" turn={Math.min(turn,45)} ink={ink}/>}
  {p>.5&&<Half side="left" turn={turn} ink={ink}/>}
  <View style={{position:'absolute',top:(SIZE-PHOTO)/2,left:(SIZE-PHOTO)/2}}><Photo id={photoId} avatar size={PHOTO} name={name} solid={ink} alt="Мой профиль"/></View>
  <View style={{position:'absolute',right:0,bottom:0,width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:ink,borderWidth:2,borderColor:C.bg}}><Image source={menuIcons.camera} style={{width:12,height:12,tintColor:C.onAccent}}/></View>
 </Pressable>;
}
