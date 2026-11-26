import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {request} from './api';
import type {Row} from './model';
import {C,type} from './styles';
import {T} from './tokens';
import {againList,markOf,mineOf,toggled,type Mine} from './favorites';

/**
 * The guest's favourites: what the server sent, and the heart just tapped before the server has answered.
 * A heart that the server refused goes back, and the reason is returned to the caller to show.
 */
export function useFavorites(data:Row,onChanged:()=>Promise<unknown>|unknown){
 const [mine,setMine]=useState<Mine>(()=>mineOf(data)),busy=useRef(false),key=(data.favorites||[]).join()+'|'+(data.stayed||[]).join();
 useEffect(()=>{if(!busy.current)setMine(mineOf(data));},[key]);
 async function toggle(id:string):Promise<string>{
  if(busy.current)return '';
  const on=!mine.favorites.includes(id),before=mine;busy.current=true;setMine(toggled(mine,id,on));
  try{const saved=await request('/api/operations/favorite',{propertyId:id,on},undefined,undefined,'guest');setMine(mineOf(saved));void onChanged();return '';}
  catch(e){setMine(before);return e instanceof Error?e.message:t('Не получилось. Попробуйте ещё раз.');}
  finally{busy.current=false;}
 }
 return {mine,toggle};
}

/** The heart on a photo or beside a title. */
export function Heart({on,title,onPress,plain}:{on:boolean;title:string;onPress:()=>void;plain?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={(on?t('Убрать из избранного: '):t('В избранное: '))+title} hitSlop={8} onPress={onPress} style={({pressed})=>[f.heart,plain&&f.heartPlain,pressed&&f.dim]}><Text style={[f.heartText,on&&f.heartOn]}>{on?'♥':'♡'}</Text></Pressable>;
}

/** «Снова туда же»: the guest's favourites and the homes of earlier stays, one tap from the map. */
export function AgainRow({properties,mine,onOpen}:{properties:Row[];mine:Mine;onOpen:(property:Row)=>void}){
 const list=againList(properties,mine);
 if(!list.length)return null;
 return <View><Text style={f.title}>{t('Снова туда же')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={f.strip} contentContainerStyle={f.stripContent} keyboardShouldPersistTaps="handled">{list.map(p=>{const fav=markOf(p.id,mine)==='favorite';return <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={(fav?t('Избранное: '):['banya','sauna','banquet','cafe'].includes(p.details?.type||p.type)?t('Вы здесь были: '):t('Вы здесь жили: '))+p.title} onPress={()=>onOpen(p)} style={({pressed})=>[f.chip,pressed&&f.dim]}><Text style={[f.chipMark,fav&&f.heartOn]}>{fav?'♥':'↻'}</Text><Text numberOfLines={1} style={f.chipText}>{p.title}</Text></Pressable>;})}</ScrollView></View>;
}

const f=StyleSheet.create({
 heart:{width:36,height:36,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center',backgroundColor:C.surface,borderWidth:1,borderColor:C.line},
 heartPlain:{backgroundColor:'transparent',borderWidth:0},
 // Black outline, black when saved: no red (board «Экраны старой версии», 2026-11-26).
 heartText:{...type.title,color:C.ink},
 heartOn:{color:C.ink},
 dim:{opacity:0.6},
 title:{...type.caption,color:C.muted,marginTop:8},
 strip:{marginHorizontal:-16,marginTop:4},
 stripContent:{paddingHorizontal:16,gap:8},
 chip:{maxWidth:200,minHeight:36,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 chipMark:{...type.label,color:C.accent},
 chipText:{...type.label,color:C.ink,flexShrink:1},
});
