import React from 'react';
import {StyleSheet,View} from 'react-native';
// Line icons drawn with views, so the chat looks the same on every phone and needs no icon font.
// Emoji such as 📎 or 📷 are drawn in colour and differently by each system.
type P={color:string;size?:number};
export function PlusIcon({color,size=22}:P){const w=2.5;return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}><View style={{position:'absolute',width:size*.8,height:w,borderRadius:w,backgroundColor:color}}/><View style={{position:'absolute',width:w,height:size*.8,borderRadius:w,backgroundColor:color}}/></View>;}
export function CameraIcon({color,size=24}:P){return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}><View style={{width:size*.4,height:size*.2,borderTopLeftRadius:4,borderTopRightRadius:4,borderWidth:2,borderBottomWidth:0,borderColor:color,marginBottom:-1}}/><View style={[i.center,{width:size*.88,height:size*.62,borderRadius:4,borderWidth:2,borderColor:color}]}><View style={{width:size*.3,height:size*.3,borderRadius:999,borderWidth:2,borderColor:color}}/></View></View>;}
// A handset: half a ring open to the upper right, with the ear and mouth pieces at its ends.
export function PhoneIcon({color,size=22}:P){const r=size*.8,w=3;return <View style={[i.center,{width:size,height:size}]}><View style={{width:r,height:r,borderRadius:999,borderWidth:w,borderLeftColor:color,borderBottomColor:color,borderTopColor:'transparent',borderRightColor:'transparent'}}/><View style={{position:'absolute',left:size*.02,top:size*.14,width:size*.42,height:size*.3,borderRadius:4,backgroundColor:color,transform:[{rotate:'-45deg'}]}}/><View style={{position:'absolute',right:size*.14,bottom:size*.02,width:size*.3,height:size*.42,borderRadius:4,backgroundColor:color,transform:[{rotate:'-45deg'}]}}/></View>;}
export function DotsIcon({color,size=22}:P){return <View style={[i.center,{width:size,height:size,flexDirection:'row',gap:4}]}>{[0,1,2].map(n=><View key={n} style={{width:4.5,height:4.5,borderRadius:999,backgroundColor:color}}/>)}</View>;}
const i=StyleSheet.create({center:{alignItems:'center',justifyContent:'center'}});
