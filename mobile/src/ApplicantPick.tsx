import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {Badge} from './PropertyListing';
import type {Row} from './model';
// Same as components/applicant-pick.tsx on the site: one row per cleaner, and the owner's decision on the row itself,
// right under the step, instead of a second card further down the screen.
export function WorkerRow({worker:w,label}:{worker:Row;label?:string}){
 const tags=[w.experience&&'Опыт: '+w.experience,w.availability&&'График: '+w.availability].filter(Boolean) as string[];
 return <View style={a.row}>
  <View style={a.who}><Photo id={w.avatar_id} avatar alt={'Фото: '+(w.name||'исполнитель')} size={48}/><View style={{flex:1,gap:2}}>{!!label&&<Text style={a.label}>{label.toUpperCase()}</Text>}<Text numberOfLines={1} style={a.name}>{w.name||'Исполнитель'}</Text><Text style={a.where}>{[w.city,w.districts].filter(Boolean).join(' · ')||'Город не указан'}</Text></View></View>
  {(tags.length>0||!label&&!!w.display_status)&&<View style={a.tags}>{!label&&<Badge status={w.display_status}/>}{tags.map(t=><Text key={t} style={a.tag}>{t}</Text>)}</View>}
 </View>;
}
export function ApplicantPick({applications,approvals,busy,onDecide}:{applications:Row[];approvals:Row[];busy:boolean;onDecide:(body:Row)=>void}){
 if(!applications.length)return <View style={[a.box,a.empty]}><Text style={a.emptyTitle}>Откликов пока нет</Text><Text style={a.note}>Исполнитель появится здесь, как только откликнется. Назначить можно одной кнопкой.</Text></View>;
 return <View style={a.box} accessibilityLabel="Отклики исполнителей">
  <Text accessibilityRole="header" style={a.title}>{applications.length===1?'Откликнулся исполнитель':'Отклики · '+applications.length}</Text>
  {applications.map((x,i)=>{const card=approvals.find(c=>c.id==='application:'+x.id),off=busy||!card,decide=(action:string)=>card&&onDecide({id:card.id,revision:card.revision,action}),name=x.worker?.name||x.name||'исполнитель';
   return <View key={x.id} style={[a.option,i>0&&a.optionLine]}><WorkerRow worker={{...x,...(x.worker||{}),experience:x.worker?.experience||x.experience}}/>
    <View style={a.decide}>
     <Pressable accessibilityRole="button" accessibilityLabel={'Назначить: '+name} disabled={off} onPress={()=>decide('accept')} style={({pressed})=>[a.btn,a.accept,(pressed||off)&&a.dim]}><Text style={a.acceptText}>✓  Назначить</Text></Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel={'Отклонить отклик: '+name} disabled={off} onPress={()=>decide('reject')} style={({pressed})=>[a.btn,a.reject,(pressed||off)&&a.dim]}><Text style={a.rejectText}>Отклонить</Text></Pressable>
    </View>
    {!card&&<Text style={[a.note,{color:C.danger}]}>Срок ответа истёк. Обновите данные.</Text>}
   </View>;})}
  <Text style={a.note}>Анкету заполняет исполнитель, платформа её пока не проверяет.</Text>
 </View>;
}
const R=T.radius,H=T.control;
const a=StyleSheet.create({
 row:{gap:12},who:{flexDirection:'row',alignItems:'center',gap:12},
 label:{...type.caption,color:C.muted,fontWeight:'600',letterSpacing:.6},name:{...type.body,color:C.ink,fontWeight:'600'},where:{...type.caption,color:C.muted},
 tags:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},tag:{...type.caption,color:C.inkSoft,backgroundColor:C.surfaceAlt,paddingHorizontal:12,paddingVertical:4,borderRadius:R.full,overflow:'hidden'},
 box:{gap:12,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.surface},
 empty:{borderStyle:'dashed',borderColor:C.line,backgroundColor:C.surfaceAlt,gap:4},emptyTitle:{...type.label,color:C.ink,fontWeight:'600'},
 title:{...type.body,color:C.ink,fontWeight:'600'},
 option:{gap:12},optionLine:{paddingTop:12,borderTopWidth:1,borderTopColor:C.line},
 decide:{flexDirection:'row',gap:8},btn:{minHeight:H.primary,borderRadius:R.md,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
 accept:{flex:1.6,backgroundColor:C.accent},acceptText:{...type.body,fontWeight:'600',color:C.onAccent},
 reject:{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},rejectText:{...type.body,fontWeight:'600',color:C.ink},
 dim:{opacity:.55},note:{...type.caption,color:C.muted},
 assigned:{padding:16,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
});
export const applicantStyles=a;
