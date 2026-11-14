import React from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import type {Reliability} from '../../lib/reliability-text';
const F=T.font,R=T.radius;
// The reliability rating: a score out of five with what it is made of.
export function ReliabilityBadge({value,title,compact=false}:{value?:Reliability|null;title?:string;compact?:boolean}){
 if(!value)return null;
 const score=value.score===null?'✦':'★ '+value.score.toFixed(1).replace('.',',');
 if(compact)return <Text style={[r.chip,value.level==='new'&&r.chipNew]}>{value.score===null?'✦ новый':score}</Text>;
 return <View accessibilityLabel={(title||'Надёжность')+': '+value.label} style={[r.box,value.level==='excellent'&&r.excellent,value.level==='attention'&&r.attention]}>
  <View style={r.score}><Text style={[r.scoreText,value.level==='new'&&{color:C.accent}]}>{score}</Text></View>
  <View style={r.text}>{!!title&&<Text style={r.title}>{title}</Text>}<Text style={r.label}>{value.label}</Text>{value.facts.length>0&&<Text style={r.facts}>{value.facts.join(' · ')}</Text>}</View>
 </View>;
}
export const reliabilityHints:Record<string,string[]>={
 guest:['Подтвердите телефон','Выезжайте вовремя и без споров','Не отменяйте подтверждённые брони'],
 owner:['Отвечайте на заявки за 15 минут','Не отменяйте подтверждённые брони','Держите жильё в порядке: гости ставят оценку'],
 cleaner:['Приходите на принятые уборки','Сдавайте отчёт с фото с первого раза','Отвечайте на предложения']
};
const r=StyleSheet.create({
 box:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surfaceAlt},
 excellent:{backgroundColor:C.successSoft,borderColor:C.successSoft},
 attention:{backgroundColor:C.warningSoft,borderColor:C.warningLine},
 score:{minWidth:64,height:44,paddingHorizontal:8,borderRadius:R.sm,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},
 scoreText:{fontSize:F.subtitle[0],lineHeight:F.subtitle[1],fontWeight:'700',color:C.ink},
 text:{flex:1,minWidth:0,gap:2},
 title:{fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted},
 label:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.ink},
 facts:{fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 chip:{paddingHorizontal:8,borderRadius:R.full,overflow:'hidden',backgroundColor:C.warningSoft,fontSize:F.caption[0],lineHeight:F.caption[1],fontWeight:'600',color:C.ink},
 chipNew:{backgroundColor:C.accentSoft}
});
