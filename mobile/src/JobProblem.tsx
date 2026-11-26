import React from 'react';
import {Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {t} from '../../lib/i18n';
import {menuIcons,type MenuIcon} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';

// «Проблема» during a cleaning (concept of 2026-11-25, Messenger and talabat): a short list of what usually goes
// wrong, one tap sends it to the owner as an issue (the AI administrator watches the answer). «Другое» asks for words.
// The text sent is the owner's notice, so it is written in full; the list shows the short name.
export const JOB_PROBLEMS:{key:string;title:string;issue:string;icon:MenuIcon}[]=[
 {key:'access',title:'Не могу попасть в жильё',issue:'Не могу попасть в жильё: нет ключей или код не подходит.',icon:'key'},
 {key:'guests',title:'Гости ещё не выехали',issue:'Гости ещё не выехали, начать уборку не могу.',icon:'users'},
 {key:'damage',title:'Поломка или ущерб',issue:'В жилье поломка или ущерб.',icon:'alert'},
 {key:'supplies',title:'Нет белья или средств',issue:'Нет чистого белья или средств для уборки.',icon:'briefcase'},
];

export function JobProblem({visible,busy,onClose,onSend,onOther}:{visible:boolean;busy:boolean;onClose:()=>void;onSend:(issue:string)=>void;onOther:()=>void}){
 const row=(key:string,title:string,icon:MenuIcon,onPress:()=>void,last=false)=><Pressable key={key} accessibilityRole="button" accessibilityLabel={title} disabled={busy} onPress={onPress} style={({pressed})=>[p.row,last&&p.last,(pressed||busy)&&p.dim]}>
  <Image source={menuIcons[icon]} style={p.icon} accessibilityElementsHidden importantForAccessibility="no"/><Text style={p.rowText}>{title}</Text><Text style={p.chevron}>›</Text>
 </Pressable>;
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable accessibilityLabel={t('Закрыть')} onPress={onClose} style={p.shade}/>
  <View style={p.sheet} accessibilityViewIsModal>
   <View style={p.grab}/>
   <Text accessibilityRole="header" style={p.title}>{t('Что случилось?')}</Text>
   <Text style={p.lead}>{t('Владелец получит сразу, ИИ-администратор проследит за ответом.')}</Text>
   <View>{JOB_PROBLEMS.map(item=>row(item.key,t(item.title),item.icon,()=>onSend(item.issue)))}{row('other',t('Другое — написать'),'messages',onOther,true)}</View>
  </View>
 </Modal>;
}

const p=StyleSheet.create({
 shade:{flex:1,backgroundColor:'rgba(15,23,42,0.32)'},
 sheet:{paddingHorizontal:20,paddingTop:8,paddingBottom:32,gap:4,borderTopLeftRadius:T.radius.xl,borderTopRightRadius:T.radius.xl,backgroundColor:C.surface},
 grab:{alignSelf:'center',width:40,height:4,borderRadius:T.radius.full,backgroundColor:C.lineStrong,marginBottom:12},
 title:{...type.subtitle,color:C.ink,fontWeight:'600'},
 lead:{...type.label,color:C.muted,marginBottom:8},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,borderBottomWidth:1,borderBottomColor:C.line},
 last:{borderBottomWidth:0},
 icon:{width:22,height:22,tintColor:C.ink},
 rowText:{...type.body,color:C.ink,flex:1},
 chevron:{...type.title,color:C.muted},
 dim:{opacity:.6},
});
