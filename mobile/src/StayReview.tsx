import {L,t} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import {s,C,type} from './styles';
import {LineRow,PopSheet} from './PopSheet';
import {Send} from './StayRequest';

// The guest rates a completed stay: the first row of the card «Оцените проживание ›»; a tap opens a sheet with five
// black stars, an optional note for the owner and «Отправить» at the bottom (board «Экраны старой версии», 2026-11-26).
const words=L(['Выберите оценку','Плохо','Так себе','Нормально','Хорошо','Отлично']);
export function StayReview({busy,onSubmit}:{busy:boolean;onSubmit:(rating:number,text:string)=>void}){
 const [open,setOpen]=useState(false),[rating,setRating]=useState(0),[text,setText]=useState('');
 return <>
  <LineRow title={t('Оцените проживание')} disabled={busy} onPress={()=>setOpen(true)}/>
  <PopSheet visible={open} title={t('Как прошло проживание?')} onClose={()=>setOpen(false)} footer={<Send title={t('Отправить')} disabled={busy||!rating} busy={busy} onPress={()=>{setOpen(false);onSubmit(rating,text.trim());}}/>}>
   <View accessibilityRole="radiogroup" accessibilityLabel={t('Оценка проживания')} style={r.stars}>{[1,2,3,4,5].map(n=><Pressable key={n} accessibilityRole="radio" accessibilityLabel={t('{n} из 5',{n})} accessibilityState={{checked:rating===n,disabled:busy}} disabled={busy} onPress={()=>setRating(n)} hitSlop={4} style={r.star}><Text style={[r.starText,{color:n<=rating?C.ink:C.lineStrong}]}>★</Text></Pressable>)}</View>
   <Text style={r.word}>{words[rating]}</Text>
   <TextInput accessibilityLabel={t('Отзыв для владельца')} placeholder={t('Что понравилось или что улучшить (необязательно)')} placeholderTextColor={C.muted} value={text} onChangeText={setText} maxLength={1000} multiline style={[s.input,r.input]} editable={!busy}/>
  </PopSheet>
 </>;
}
const r=StyleSheet.create({
 stars:{flexDirection:'row',justifyContent:'center',gap:8},star:{padding:4},starText:{fontSize:40,lineHeight:44},
 word:{...type.label,textAlign:'center',color:C.inkSoft},input:{minHeight:96,padding:12,borderWidth:1,borderColor:C.line,borderRadius:12,textAlignVertical:'top'},
});
