import {t as tr} from '../../lib/i18n';
import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {Badge} from './PropertyListing';
import type {Row} from './model';
import {cleanerNext} from '../../lib/cleaner-next';
import {ReliabilityBadge} from './Reliability';
// Same words as the site: assignment waits for the platform check of the cleaner, and the row says so up front.
const admissionNotes:Record<string,string>=/* i18n */{none:'Анкета исполнителя ещё не отправлена на проверку платформы. Назначить можно после проверки.',pending:'Анкету исполнителя проверяет администратор платформы. Назначить можно сразу после проверки, мы пришлём уведомление.',expired:'Срок проверки исполнителя истёк. Назначить можно после новой проверки.',rejected:'Исполнитель не прошёл проверку платформы. Назначить его нельзя.'};
// Same as components/applicant-pick.tsx on the site: one row per cleaner, and the owner's decision on the row itself,
// right under the step, instead of a second card further down the screen.
export function WorkerRow({worker:w,label}:{worker:Row;label?:string}){
 const tags=[w.experience&&tr('Опыт: {experience}',{experience:w.experience}),w.availability&&tr('График: {availability}',{availability:w.availability})].filter(Boolean) as string[];
 return <View style={a.row}>
  <View style={a.who}><Photo id={w.avatar_id} avatar alt={tr('Фото: {v}',{v:(w.name||tr('исполнитель'))})} size={48}/><View style={{flex:1,gap:2}}>{!!label&&<Text style={a.label}>{label.toUpperCase()}</Text>}<Text numberOfLines={1} style={a.name}>{w.name||tr('Исполнитель')}</Text><Text style={a.where}>{[w.city,w.districts].filter(Boolean).join(' · ')||tr('Город не указан')}</Text></View></View>
  {(tags.length>0||!label&&!!w.display_status)&&<View style={a.tags}>{!label&&<Badge status={w.display_status}/>}{tags.map(t=><Text key={t} style={a.tag}>{t}</Text>)}</View>}
 </View>;
}
// bare: inside another card (the owner's «Заявки»), without its own frame and title.
export function ApplicantPick({applications,approvals,busy,onDecide,bare=false}:{applications:Row[];approvals:Row[];busy:boolean;onDecide:(body:Row)=>void;bare?:boolean}){
 if(!applications.length)return <View style={[a.box,a.empty]}><Text style={a.emptyTitle}>{tr('Откликов пока нет')}</Text><Text style={a.note}>{tr('Исполнитель появится здесь, как только откликнется. Назначить можно одной кнопкой.')}</Text></View>;
 return <View style={[a.box,bare&&a.bare]} accessibilityLabel={tr('Отклики исполнителей')}>
  {!bare&&<Text accessibilityRole="header" style={a.title}>{applications.length===1?tr('Откликнулся исполнитель'):tr('Отклики · {length}',{length:applications.length})}</Text>}
  {applications.map((x,i)=>{const card=approvals.find(c=>c.id==='application:'+x.id),admission=x.admission??x.worker?.admission,blocked=!!admission&&admission in admissionNotes,off=busy||!card,decide=(action:string)=>card&&onDecide({id:card.id,revision:card.revision,action}),name=x.worker?.name||x.name||tr('исполнитель');
   return <View key={x.id} style={[a.option,i>0&&a.optionLine]}><WorkerRow worker={{...x,...(x.worker||{}),experience:x.worker?.experience||x.experience}}/>{!!x.worker?.reliability&&<View style={{marginTop:8}}><ReliabilityBadge value={x.worker.reliability} title={tr('Исполнитель')}/></View>}
    <View style={a.decide}>
     <Pressable accessibilityRole="button" accessibilityLabel={tr('Выбрать: {name}',{name})} disabled={off||blocked} onPress={()=>decide('accept')} style={({pressed})=>[a.btn,a.accept,(pressed||off||blocked)&&a.dim]}><Text style={a.acceptText}>{tr('Выбрать')}</Text></Pressable>
     {/* Board «Экраны старой версии», 2026-11-26: one main button; «Отклонить» is a quiet word beside it. */}
     <Pressable accessibilityRole="button" accessibilityLabel={tr('Отклонить отклик: {name}',{name})} disabled={off} onPress={()=>decide('reject')} hitSlop={8} style={({pressed})=>[a.reject,(pressed||off)&&a.dim]}><Text style={a.rejectText}>{tr('Отклонить')}</Text></Pressable>
    </View>
    {blocked&&<Text style={[a.admission,admission==='rejected'&&a.admissionBad]}>{tr(admissionNotes[admission])}</Text>}
    {!card&&!blocked&&<Text style={[a.note,{color:C.danger}]}>{tr('Срок ответа истёк. Обновите данные.')}</Text>}
   </View>;})}
  {applications.every(x=>(x.admission??x.worker?.admission??'not_required')==='not_required')&&<Text style={a.note}>{tr('Анкету заполняет исполнитель, платформа её пока не проверяет.')}</Text>}
 </View>;
}
// The cleaner's own card: what happens next with the response, said once.
export function CleanerNextBox({job,application,admission,userId,busy,onRequestReview}:{job:Row;application?:Row;admission?:string;userId:string;busy:boolean;onRequestReview:()=>void}){
 const next=cleanerNext(job,application,admission,userId);if(!next)return null;
 return <View accessibilityRole="summary" style={[a.next,next.tone==='warning'&&a.nextWarn,next.tone==='danger'&&a.nextBad]}>
  <Text style={a.nextTitle}>{next.title}</Text><Text style={a.nextText}>{next.text}</Text>
  {next.action==='request-review'&&<Pressable accessibilityRole="button" disabled={busy} onPress={onRequestReview} style={({pressed})=>[a.btn,a.accept,(pressed||busy)&&a.dim]}><Text style={a.acceptText}>{tr('Отправить анкету на проверку')}</Text></Pressable>}
 </View>;
}
const R=T.radius,H=T.control;
const a=StyleSheet.create({
 row:{gap:12},who:{flexDirection:'row',alignItems:'center',gap:12},
 label:{...type.caption,color:C.muted,fontWeight:'600'},name:{...type.body,color:C.ink,fontWeight:'600'},where:{...type.caption,color:C.muted},
 tags:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},tag:{...type.caption,color:C.inkSoft,backgroundColor:C.surfaceAlt,paddingHorizontal:12,paddingVertical:4,borderRadius:R.full,overflow:'hidden'},
 box:{gap:12,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},bare:{borderWidth:0,borderRadius:0},
 empty:{borderStyle:'dashed',borderColor:C.line,backgroundColor:C.surfaceAlt,gap:4},emptyTitle:{...type.label,color:C.ink,fontWeight:'600'},
 title:{...type.body,color:C.ink,fontWeight:'600'},
 option:{gap:12},optionLine:{paddingTop:12,borderTopWidth:1,borderTopColor:C.line},
 decide:{flexDirection:'row',alignItems:'center',gap:16},btn:{minHeight:H.primary,borderRadius:R.md,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
 accept:{flex:1,borderRadius:R.full,backgroundColor:C.accent},acceptText:{...type.body,fontWeight:'600',color:C.onAccent},
 reject:{minHeight:H.primary,justifyContent:'center',paddingHorizontal:4},rejectText:{...type.body,fontWeight:'600',color:C.ink,textDecorationLine:'underline'},
 dim:{opacity:.55},note:{...type.caption,color:C.muted},
 admission:{...type.label,color:C.ink,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.warningLine,backgroundColor:C.warningSoft,overflow:'hidden'},admissionBad:{borderColor:C.danger,backgroundColor:C.dangerSoft},
 next:{gap:4,padding:16,borderRadius:R.lg,borderWidth:1,borderColor:C.infoLine,backgroundColor:C.infoSoft,marginTop:8},nextWarn:{borderColor:C.warningLine,backgroundColor:C.warningSoft},nextBad:{borderColor:C.danger,backgroundColor:C.dangerSoft},nextTitle:{...type.label,color:C.ink,fontWeight:'600'},nextText:{...type.label,color:C.inkSoft,marginBottom:4},
 assigned:{padding:16,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
});
export const applicantStyles=a;
