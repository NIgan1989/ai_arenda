import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {Pressable,type StyleProp,type ViewStyle} from 'react-native';
import {PhotoViewer} from './PhotoViewer';
import {loadMedia,useMedia} from './ListingMedia';

// The photos of a place over the whole screen (one viewer for the place's page, the cleaner's job, the booking card):
// a swipe to the side leafs them, a pinch or a double tap zooms, a swipe up or down closes, «n из N» on top.
// The photos come by their stored ids; the neighbours are fetched ahead so leafing does not wait.
export function PhotoGallery({ids,start=0,visible,onClose,title}:{ids:string[];start?:number;visible:boolean;onClose:()=>void;title:string}){
 const [index,setIndex]=useState(start),i=Math.min(Math.max(0,index),Math.max(0,ids.length-1)),id=ids[i]||'',media=useMedia(visible?id:null);
 useEffect(()=>{if(visible)setIndex(start);},[visible,start]);
 useEffect(()=>{if(!visible)return;for(const k of [i+1,i-1])if(ids[k])void loadMedia(ids[k]).catch(()=>{});},[visible,i,ids]);
 const n=ids.length;
 return <PhotoViewer id={id} uri={media?.uri||''} loading={!media} alt={t('{title}, фото {v}',{title,v:i+1})} visible={visible&&!!id} dots={{count:n,index:i}} title={n>1?t('{n} из {total}',{n:i+1,total:n}):''} onClose={onClose}
  onPrev={i>0?()=>setIndex(i-1):undefined} onNext={i<n-1?()=>setIndex(i+1):undefined}/>;
}

// A photo (or a strip of them) that opens the gallery on a tap, at the photo that was tapped.
export function PhotoTap({ids,index=0,title,style,children}:{ids:string[];index?:number;title:string;style?:StyleProp<ViewStyle>;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 if(!ids.length)return <>{children}</>;
 return <>
  <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('Открыть фото: {title}',{title})} accessibilityHint={ids.length>1?t('Листайте фото в сторону'):undefined} onPress={()=>setOpen(true)} style={({pressed})=>[style,pressed&&{opacity:.85}]}>{children}</Pressable>
  <PhotoGallery ids={ids} start={index} visible={open} onClose={()=>setOpen(false)} title={title}/>
 </>;
}
