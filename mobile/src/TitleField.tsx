import {t} from '../../lib/i18n';
// «Заголовок» (2026-11-27): the start of the title comes from the fields, the owner writes only what sets the place
// apart. While the field is empty it shows an example in grey, which goes with the first letter; then a counter.
// What the rules will tidy (lib/listing-title.ts) is shown at once: «Гости увидят: 2-комнатная · у парка».
import React from 'react';
import {View,Text,TextInput,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {TITLE_TAIL_MAX,formatTitle,isNamedKind,joinTitle,titleExample,titleHead,titleInput} from '../../lib/listing-title';
const R=T.radius,H=T.control;
type Place={district?:string;city?:string};


// title: the whole stored title; onChange gets the whole title back, as typed (the server tidies it on save).
export function TitleField({kind,rooms,title,onChange,place={},label}:{kind?:string;rooms?:number;title:string;onChange:(title:string)=>void;place?:Place;label?:string}){
 const head=titleHead(kind,rooms),named=isNamedKind(kind),value=titleInput(title),typed=value.trim();
 const plain=joinTitle(value,kind,rooms),shown=formatTitle(plain,kind,rooms,place);
 return <View style={f.field}>
  {!!label&&<Text style={f.label}>{label}</Text>}
  <View style={f.box}><Text style={f.head}>{named?head:head+' ·'}</Text><TextInput accessibilityLabel={t('Заголовок: {head}',{head})} style={f.input} value={value} maxLength={TITLE_TAIL_MAX+12} placeholder={titleExample(kind)} placeholderTextColor={C.muted} autoCorrect autoCapitalize="none" onChangeText={v=>onChange(joinTitle(v,kind,rooms))}/></View>
  {!typed?<Text style={f.hint}>{named?t('Название, как его знают гости. Можно добавить примету: «Арасан» на дровах'):t('Чем выделяется: место рядом, улица или вид. Коротко, со строчной буквы')}</Text>
   :<View style={f.foot}>{shown!==plain?<Text style={f.shown} numberOfLines={2}>{t('Гости увидят: {title}',{title:shown})}</Text>:<View style={f.grow}/>}<Text style={[f.count,typed.length>TITLE_TAIL_MAX&&f.over]}>{typed.length} / {TITLE_TAIL_MAX}</Text></View>}
 </View>;
}

const f=StyleSheet.create({
 field:{gap:8},label:{...type.label,color:C.ink,fontWeight:'600'},
 box:{minHeight:H.field,flexDirection:'row',alignItems:'center',gap:4,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16},
 head:{...type.body,color:C.ink,fontWeight:'600'},input:{flex:1,minWidth:0,paddingVertical:12,color:C.ink,...type.body},
 hint:{...type.caption,color:C.muted},foot:{flexDirection:'row',alignItems:'flex-start',gap:8},grow:{flex:1},
 shown:{flex:1,...type.caption,color:C.ink},count:{...type.caption,color:C.muted},over:{color:C.danger},
});
