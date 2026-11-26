import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {ApiError,StaleSessionError,request} from './api';
import {C} from './styles';
import {Thinking} from './Thinking';
import type {Role} from './model';
import {PhotoViewer,bubbleSize,usePhotoSize,type Size} from './PhotoViewer';

// A photo inside a chat bubble: its own proportions, a calm grey box while it loads, the time over its corner, and a
// tap that opens it over the whole screen.

// Photos already downloaded in this run of the app, so scrolling back or reopening a chat does not download them again.
const cache=new Map<string,string>();
const remember=(key:string,data:string)=>{cache.delete(key);cache.set(key,data);while(cache.size>40)cache.delete(cache.keys().next().value as string);};
export const rememberPhoto=(roomId:string,seq:number,data:string)=>remember(roomId+':'+seq,data);
// The text the server writes for a photo sent without words: it is not shown as a caption.
export const photoCaption=(body:unknown)=>{const text=String(body||'').trim();return text==='Фотография'?'':text;};
export const usePhotoWidth=()=>{const {width}=useWindowDimensions();return Math.min(260,Math.round(width*.68));};

type Stamp={time:string;ticks?:string;read?:boolean};
export function TimeBadge({time,ticks,read}:Stamp){
 return <View pointerEvents="none" style={p.badge}><Text style={p.badgeText}>{time}</Text>{!!ticks&&<Text accessibilityLabel={read?t('Прочитано'):t('Отправлено')} style={[p.badgeText,read&&p.read]}>{ticks}</Text>}</View>;
}

type Frame={onSized?:()=>void;uri:string;size?:Size|null;stamp?:Stamp|null;onOpen?:()=>void;dim?:boolean;children?:React.ReactNode;state?:'loading'|'error';onRetry?:()=>void;error?:string};
export function PhotoFrame({onSized,uri,size:known,stamp,onOpen,dim,children,state,onRetry,error}:Frame){
 const width=usePhotoWidth(),size=usePhotoSize(uri,known),box=bubbleSize(size,width);
 // The bubble takes its final height once the photo is measured; the chat keeps its end in view.
 useEffect(()=>{if(size)onSized?.();},[size?.width,size?.height]);
 return <Pressable accessibilityRole={state==='error'?'button':'imagebutton'} accessibilityLabel={state==='error'?t('Повторить загрузку фото'):t('Открыть фотографию сообщения')} disabled={state==='loading'||!onOpen&&!onRetry} onPress={state==='error'?onRetry:onOpen} style={({pressed})=>[p.frame,box,pressed&&p.pressed]}>
  {!!uri&&<Image source={{uri}} accessibilityIgnoresInvertColors style={[StyleSheet.absoluteFill,dim&&p.dim]} resizeMode="cover"/>}
  {state==='loading'&&<View style={p.center}><Thinking size="sm"/></View>}
  {state==='error'&&<View style={p.center}><Text style={p.retryIcon}>↻</Text><Text style={p.retryText}>{error||t('Фото не загрузилось')}</Text><Text style={p.retryHint}>{t('Нажмите, чтобы повторить')}</Text></View>}
  {children}
  {!!stamp&&<TimeBadge {...stamp}/>}
 </Pressable>;
}

// A photo already in the chat. Downloaded once per run of the app; a failure can be retried with a tap.
export function PrivatePhoto({roomId,seq,role,onAuthError,stamp,caption,title,onSized}:{onSized?:()=>void;roomId:string;seq:number;role:Role;onAuthError?:(error:unknown)=>void|Promise<void>;stamp?:Stamp|null;caption?:string;title?:string}){
 const key=roomId+':'+seq,[uri,setUri]=useState(cache.get(key)||''),[open,setOpen]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const cached=cache.get(key);if(cached){setUri(cached);return;}
  let live=true;setError('');
  request('/api/operations/discussion/photo',{roomId,seq},undefined,undefined,role).then(r=>{remember(key,r.data);if(live)setUri(r.data);}).catch(e=>{if(!live||e instanceof StaleSessionError)return;setError(e instanceof ApiError&&e.status===404?t('Фото недоступно'):t('Фото не загрузилось'));if(e instanceof ApiError&&e.status===401)void onAuthError?.(e);});
  return()=>{live=false;};
 },[key,role,attempt]);
 return <>
  <PhotoFrame onSized={onSized} uri={uri} stamp={stamp} state={uri?undefined:error?'error':'loading'} error={error} onRetry={()=>setAttempt(a=>a+1)} onOpen={()=>setOpen(true)}/>
  {!!uri&&<PhotoViewer uri={uri} visible={open} onClose={()=>setOpen(false)} title={title} caption={caption}/>}
 </>;
}

// A photo on its way: the picture at once, how much has gone, and on a failure «Повторить» and «Удалить».
export type Outgoing={key:string;roomId:string;photo:string;size?:Size|null;text:string;reply?:any;progress:number;status:'sending'|'failed';error?:string;at:number};
export function OutgoingPhoto({item,time,onRetry,onDelete}:{item:Outgoing;time:string;onRetry:()=>void;onDelete:()=>void}){
 const [open,setOpen]=useState(false),failed=item.status==='failed',percent=Math.round(item.progress*100),caption=item.text.trim();
 return <View style={[p.bubble,caption?p.withCaption:null]}>
  <PhotoFrame uri={item.photo} size={item.size} dim={!failed} onOpen={()=>setOpen(true)} stamp={caption?null:{time,ticks:failed?'!':'◷'}}>
   {!failed&&<View pointerEvents="none" style={p.center}><View style={p.progressBox}><Thinking size="sm" color={C.onAccent}/><Text style={p.progressText}>{percent>0&&percent<100?percent+'%':t('Отправляем…')}</Text></View></View>}
   {!failed&&<View pointerEvents="none" style={p.track}><View style={[p.bar,{width:`${Math.max(4,percent)}%`}]}/></View>}
  </PhotoFrame>
  {!!caption&&<Text style={p.caption}>{caption}</Text>}
  {!!caption&&<View style={p.row}><Text style={p.time}>{time}</Text><Text style={p.time}>{failed?'!':'◷'}</Text></View>}
  {failed&&<View style={p.failed}><Text accessibilityRole="alert" style={p.failedText}>{item.error||t('Фото не отправлено')}</Text><View style={p.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Повторить отправку фото')} onPress={onRetry} style={({pressed})=>[p.action,p.actionMain,pressed&&p.pressed]}><Text style={p.actionMainText}>{t('Повторить')}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Удалить неотправленное фото')} onPress={onDelete} style={({pressed})=>[p.action,pressed&&p.pressed]}><Text style={p.actionText}>{t('Удалить')}</Text></Pressable>
  </View></View>}
  <PhotoViewer uri={item.photo} size={item.size} visible={open} onClose={()=>setOpen(false)} caption={caption}/>
 </View>;
}

const p=StyleSheet.create({
 frame:{borderRadius:12,overflow:'hidden',backgroundColor:C.surfaceAlt,maxWidth:'100%'},pressed:{opacity:.85},dim:{opacity:.6},
 center:{position:'absolute',left:0,right:0,top:0,bottom:0,alignItems:'center',justifyContent:'center',gap:4,padding:12},
 retryIcon:{fontSize:22,lineHeight:28,color:C.ink},retryText:{fontSize:14,lineHeight:20,fontWeight:'600',color:C.ink,textAlign:'center'},retryHint:{fontSize:12,lineHeight:16,color:C.muted,textAlign:'center'},
 badge:{position:'absolute',right:6,bottom:6,flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:2,borderRadius:999,backgroundColor:'rgba(0,0,0,0.5)'},
 badgeText:{fontSize:12,lineHeight:16,color:C.onAccent,fontWeight:'500'},read:{color:C.domeTo},
 progressBox:{alignItems:'center',gap:4,paddingHorizontal:12,paddingVertical:8,borderRadius:12,backgroundColor:'rgba(0,0,0,0.45)'},progressText:{fontSize:12,lineHeight:16,color:C.onAccent,fontWeight:'600'},
 track:{position:'absolute',left:0,right:0,bottom:0,height:4,backgroundColor:'rgba(0,0,0,0.25)'},bar:{height:4,backgroundColor:C.accent},
 bubble:{alignSelf:'flex-end',maxWidth:'88%',padding:4,borderTopLeftRadius:16,borderBottomLeftRadius:16,borderTopRightRadius:0,borderBottomRightRadius:0,backgroundColor:C.bubbleMine,gap:4,marginVertical:2},withCaption:{paddingBottom:4},
 caption:{fontSize:16,lineHeight:24,color:C.ink,paddingHorizontal:8},row:{flexDirection:'row',justifyContent:'flex-end',gap:4,paddingHorizontal:8},time:{fontSize:12,lineHeight:16,color:C.muted},
 failed:{paddingHorizontal:8,paddingBottom:4,gap:4},failedText:{fontSize:12,lineHeight:16,color:C.danger},actions:{flexDirection:'row',gap:8},
 action:{minHeight:36,paddingHorizontal:12,borderRadius:999,justifyContent:'center',backgroundColor:C.glassInk},actionMain:{backgroundColor:C.accent},actionText:{fontSize:14,fontWeight:'600',color:C.ink},actionMainText:{fontSize:14,fontWeight:'600',color:C.onAccent},
});
