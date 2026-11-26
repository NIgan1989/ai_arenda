import {t} from '../../lib/i18n';
import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {STAY_CLASSES,stayClasses,stayClassNotes,type StayClass} from '../../lib/stay-class';
const R=T.radius;

// «Класс жилья» (lib/stay-class.ts): four lines, the name and one line under it, the chosen one in ink. The AI's guess
// is marked «ИИ предлагает» with its reasons under the list, so the owner sees why and changes it with one tap.
export function StayClassPicker({value,guess,reasons=[],locked=false,onChange}:{value:string|null;guess?:string|null;reasons?:string[];locked?:boolean;onChange:(v:StayClass)=>void}){
 return <View style={c.box}>
  <View style={c.list} accessibilityRole="radiogroup" accessibilityLabel={t('Класс жилья')}>{STAY_CLASSES.map((id,i)=>{const on=value===id;return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={stayClasses[id]} accessibilityState={{checked:on,disabled:locked}} disabled={locked} onPress={()=>onChange(id)} style={({pressed})=>[c.option,i>0&&c.line,on&&c.on,pressed&&{opacity:.7}]}>
   <View style={{flex:1,gap:2}}><Text style={[c.title,on&&c.titleOn]}>{stayClasses[id]}{guess===id?<Text style={c.ai}>{'  '}{t('ИИ предлагает')}</Text>:null}</Text><Text style={c.note}>{stayClassNotes[id]}</Text></View>
   <View style={[c.radio,on&&c.radioOn]}>{on&&<View style={c.dot}/>}</View>
  </Pressable>;})}</View>
  {!!reasons.length&&<Text style={c.hint}>{t('Почему: {v}.',{v:reasons.join(', ').toLocaleLowerCase('ru')})}</Text>}
  <Text style={c.hint}>{locked?t('Класс поправил администратор сервиса. Если не согласны, напишите ИИ-администратору.'):t('Гости видят класс на карточке и ищут по нему. Цену ИИ сравнит с жильём этого же класса. Комиссия от класса не зависит.')}</Text>
 </View>;
}

const c=StyleSheet.create({
 box:{gap:8},
 list:{borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden'},
 option:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:16,paddingVertical:8},line:{borderTopWidth:1,borderTopColor:C.line},on:{backgroundColor:C.bg},
 title:{...type.body,color:C.inkSoft},titleOn:{color:C.ink,fontWeight:'700'},ai:{...type.caption,color:C.muted,fontWeight:'600'},note:{...type.caption,color:C.muted},
 radio:{width:22,height:22,borderRadius:R.full,borderWidth:1.5,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},radioOn:{borderColor:C.ink},dot:{width:12,height:12,borderRadius:R.full,backgroundColor:C.ink},
 hint:{...type.caption,color:C.muted},
});
