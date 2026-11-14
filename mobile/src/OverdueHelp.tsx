import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {T} from './tokens';
import type {Row} from './model';
import {extendChoices,extendLabel,isUnclaimed,overdueNote} from '../../lib/overdue-text';

type Confirm={label:string;text:string;body:Row}|null;
// Same as components/overdue-help.tsx on the site: an overdue cleaning says what happened, what the AI administrator
// already did, and gives the ways out right under the timer. A step that cannot be undone asks once in the box.
export function OverdueHelp({job,role,busy,onAction}:{job:Row;role:'owner'|'cleaner';busy:boolean;onAction:(body:Row)=>void}){
 const [t,setT]=useState(()=>Math.floor(Date.now()/1000)),[ask,setAsk]=useState<Confirm>(null);
 useEffect(()=>{const timer=setInterval(()=>setT(Math.floor(Date.now()/1000)),15000);return()=>clearInterval(timer);},[]);
 const note=overdueNote(job,role,t);if(!note)return null;
 const owner=role==='owner',started=job.status==='in_progress',unclaimed=isUnclaimed(job,t);
 const act=(body:Row)=>{setAsk(null);onAction({...body,expectedVersion:job.version});};
 const btn=(label:string,onPress:()=>void,kind:'main'|'side'|'danger'='side')=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress} style={({pressed})=>[o.btn,kind==='main'&&o.main,kind==='danger'&&o.ghost,(pressed||busy)&&o.dim]}><Text style={[o.btnText,kind==='main'&&o.mainText,kind==='danger'&&o.dangerText]}>{label}</Text></Pressable>;
 return <View style={o.box} accessibilityLabel={note.title}>
  <Text accessibilityRole="header" style={o.title}>⏱  {note.title}</Text>
  <Text style={o.text}>{note.text}</Text>
  <Text style={o.ai}>✦  {note.ai}</Text>
  {ask?<View style={o.confirm}><Text style={[o.text,{color:T.color.ink}]}>{ask.text}</Text>{btn(ask.label,()=>act(ask.body),'main')}{btn('Назад',()=>setAsk(null))}</View>:unclaimed?<>
   {btn('Искать на новое время',()=>act({action:'repost'}),'main')}
   {btn('Убрали сами, закрыть',()=>setAsk({label:'Да, убрали сами',text:'Закрыть уборку без исполнителя? Жильё будет отмечено готовым, платить никому не нужно.',body:{action:'close',confirmed:true}}))}
   {btn('Отменить уборку',()=>setAsk({label:'Отменить уборку',text:'Отменить уборку совсем? Готовность жилья нужно будет отметить отдельно.',body:{action:'cancel',reason:'Уборка просрочена'}}),'danger')}
  </>:<>
   <Text style={o.label}>{owner?'ПРОДЛИТЬ СРОК':'НУЖНО ЕЩЁ ВРЕМЯ'}</Text>
   <View style={o.chips}>{extendChoices.map(m=><View key={m} style={{flex:1}}>{btn('+'+extendLabel(m),()=>act({action:'extend',minutes:m}))}</View>)}</View>
   {owner&&started&&btn('Уборка сделана, закрыть',()=>setAsk({label:'Да, уборка выполнена',text:'Закрыть уборку без отчёта исполнителя? Жильё будет отмечено готовым, оплата исполнителю пройдёт как за принятую работу.',body:{action:'close',confirmed:true}}),'main')}
   {btn(owner?'Найти другого исполнителя':'Не смогу закончить',()=>setAsk(owner?{label:'Найти другого',text:'Снять текущего исполнителя и вернуть уборку в поиск? Он получит уведомление, резерв оплаты вернётся.',body:{action:'release'}}:{label:'Да, отказаться',text:'Отказаться от задания? Уборка вернётся в поиск, владелец получит уведомление.',body:{action:'release'}}))}
   {owner&&btn('Отменить уборку',()=>setAsk({label:'Отменить уборку',text:'Отменить уборку совсем? Готовность жилья нужно будет отметить отдельно.',body:{action:'cancel',reason:'Уборка просрочена'}}),'danger')}
  </>}
 </View>;
}
const o=StyleSheet.create({
 box:{gap:T.space[4],marginTop:T.space[4],padding:T.space[5],borderWidth:1,borderColor:T.color.warningLine,borderRadius:T.radius.xl,backgroundColor:T.color.warningSoft},
 title:{fontSize:16,lineHeight:24,fontWeight:'600',color:T.color.ink},
 text:{fontSize:14,lineHeight:20,color:T.color.inkSoft},
 ai:{fontSize:12,lineHeight:16,color:T.color.inkSoft,backgroundColor:T.color.surface,borderRadius:T.radius.md,paddingVertical:T.space[3],paddingHorizontal:T.space[4],overflow:'hidden'},
 label:{fontSize:12,lineHeight:16,fontWeight:'600',color:T.color.muted,letterSpacing:.6},
 chips:{flexDirection:'row',gap:T.space[3]},
 btn:{minHeight:T.control.touch,justifyContent:'center',alignItems:'center',paddingHorizontal:T.space[3],paddingVertical:T.space[3],borderRadius:T.radius.md,borderWidth:1,borderColor:T.color.line,backgroundColor:T.color.surface},
 main:{backgroundColor:T.color.accent,borderColor:T.color.accent},
 ghost:{backgroundColor:'transparent',borderColor:'transparent',minHeight:36},
 dim:{opacity:.6},
 btnText:{fontSize:16,lineHeight:20,fontWeight:'600',color:T.color.ink,textAlign:'center'},
 mainText:{color:T.color.onAccent},
 dangerText:{color:T.color.danger},
 confirm:{gap:T.space[3],padding:T.space[4],borderRadius:T.radius.md,backgroundColor:T.color.surface}
});
