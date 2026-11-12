import React,{useState} from 'react';
import {View,Text,TextInput,Pressable} from 'react-native';
import {s,C} from './styles';

// The guest rates a completed stay: five stars and an optional note for the owner.
const words=['Выберите оценку','Плохо','Так себе','Нормально','Хорошо','Отлично'];
export function StayReview({busy,onSubmit}:{busy:boolean;onSubmit:(rating:number,text:string)=>void}){
 const [rating,setRating]=useState(0),[text,setText]=useState('');
 return <View style={[s.card,{gap:8}]}>
  <Text style={s.eventTitle}>Как прошло проживание?</Text>
  <View accessibilityRole="radiogroup" accessibilityLabel="Оценка проживания" style={{flexDirection:'row',gap:4}}>
   {[1,2,3,4,5].map(n=><Pressable key={n} accessibilityRole="radio" accessibilityLabel={n+' из 5'} accessibilityState={{checked:rating===n,disabled:busy}} disabled={busy} onPress={()=>setRating(n)} hitSlop={4} style={{padding:4}}><Text style={{fontSize:36,lineHeight:40,color:n<=rating?C.accent:C.lineStrong}}>★</Text></Pressable>)}
  </View>
  <Text style={s.meta}>{words[rating]}</Text>
  <TextInput accessibilityLabel="Отзыв для владельца" placeholder="Что понравилось или что улучшить (необязательно)" placeholderTextColor={C.muted} value={text} onChangeText={setText} maxLength={1000} multiline style={s.input} editable={!busy}/>
  <Pressable accessibilityRole="button" disabled={busy||!rating} onPress={()=>onSubmit(rating,text.trim())} style={[s.button,(busy||!rating)&&s.disabled]}><Text style={s.buttonText}>Отправить оценку</Text></Pressable>
 </View>;
}
