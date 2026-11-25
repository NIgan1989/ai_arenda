import {forms,t} from '../../lib/i18n';
import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {RowIcon} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';

type Row=Record<string,any>;
const ZONE=5*3600,DAY=86400;
const dayOf=(at:number)=>Math.floor((at+ZONE)/DAY);
const tenge=(v:number)=>String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' ₸';
const clock=(at:number)=>{const d=new Date((at+ZONE)*1000);return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');};
const DAYS=['пн','вт','ср','чт','пт','сб','вс'];

// The week of a cleaner in numbers, from the jobs already on the phone: what the accepted cleanings of this week paid
// (Monday to Sunday, Kazakhstan time), by day. Pure, so the menu row and the screen say the same sum.
export function cleanerWeek(jobs:Row[],userId:string,now:number){
 const today=dayOf(now),monday=today-((today+3)%7),mine=jobs.filter(j=>j.assigned_to===userId);
 const done=mine.filter(j=>j.status==='completed'&&dayOf(Number(j.completed_at||j.end))>=monday&&dayOf(Number(j.completed_at||j.end))<monday+7);
 const days=DAYS.map((_,i)=>done.filter(j=>dayOf(Number(j.completed_at||j.end))===monday+i).reduce((s,j)=>s+(Number(j.fee)||0),0));
 const rated=done.filter(j=>Number(j.rating)>0),late=done.filter(j=>Number(j.submitted_at)>Number(j.end)).length;
 const paid=mine.filter(j=>j.status==='completed'&&(j.payment_received_at||j.settled_at)).length,waiting=mine.filter(j=>j.status==='completed'&&Number(j.fee)>0&&!j.payment_received_at&&!j.settled_at).length;
 const tomorrow=mine.filter(j=>j.status==='assigned'&&dayOf(Number(j.start))===today+1).sort((a,b)=>a.start-b.start);
 return {sum:days.reduce((s,v)=>s+v,0),count:done.length,days,todayIndex:today-monday,rating:rated.length?rated.reduce((s,j)=>s+Number(j.rating),0)/rated.length:0,late,paid,waiting,tomorrow};
}

// «Заработок» of the cleaner (concept of 2026-11-25): the week's money large with how it went, the days as bars,
// the «Постоянный исполнитель» card (a status as in OpenTable: the owner pins the cleaner to a home, there is no
// counter to reach it), then two rows: what tomorrow holds and how the owners pay. No tiles, no advice: one look.
export function CleanerEarnings({jobs,userId,now,regular=0}:{jobs:Row[];userId:string;now:number;regular?:number}){
 const w=cleanerWeek(jobs,userId,now),top=Math.max(1,...w.days);
 const facts=[t('уборок: {n}',{n:w.count}),w.rating?'★ '+w.rating.toFixed(1).replace('.',','):'',w.count?(w.late?t('опозданий: {n}',{n:w.late}):t('без опозданий')):''].filter(Boolean).join(' · ');
 const next=w.tomorrow.map(j=>clock(Number(j.start))).join(t(' и '));
 return <View style={e.box}>
  <View style={e.head}><Text style={e.caption}>{t('Эта неделя')}</Text><Text accessibilityRole="header" style={e.sum}>{tenge(w.sum)}</Text><Text style={e.facts}>{facts}</Text></View>
  <View style={e.bars} accessibilityLabel={t('По дням: {v}',{v:w.days.map((v,i)=>t(DAYS[i])+' '+tenge(v)).join(', ')})}>
   {w.days.map((v,i)=><View key={i} style={e.col}><View style={e.track}><View style={[e.bar,{height:Math.max(v?8:4,Math.round(112*v/top))},i===w.todayIndex?e.barNow:v?e.barDone:null]}/></View><Text style={[e.day,i===w.todayIndex&&e.dayNow]}>{t(DAYS[i])}</Text></View>)}
  </View>
  <View style={e.status} accessible accessibilityLabel={t('Постоянный исполнитель')+'. '+(regular?t('Объектов: {n}. Их уборки приходят вам первыми, а ваше «да» сразу назначает.',{n:regular}):t('Владелец может закрепить вас за жильём после хороших уборок. Тогда его уборки будут приходить вам первыми.'))}>
   <View style={e.statusHead}><RowIcon icon="star" tint={C.ink}/><Text style={e.title}>{t('Постоянный исполнитель')}</Text>{regular>0&&<Text style={e.statusTag}>{t(forms(regular,'{n} объект','{n} объекта','{n} объектов'),{n:regular})}</Text>}</View>
   <Text style={e.statusText}>{regular?t('Уборки этих владельцев приходят вам первыми, а ваше «да» сразу назначает.'):t('Владелец может закрепить вас за жильём после хороших уборок. Тогда его уборки будут приходить вам первыми.')}</Text>
  </View>
  <View style={e.rows}>
   <View style={e.row}><RowIcon icon="clock" tint={C.success}/><View style={e.grow}><Text style={e.title}>{w.tomorrow.length?t('Завтра уборок: {n}',{n:w.tomorrow.length}):t('Завтра свободно')}</Text>{!!next&&<Text style={e.note}>{next}</Text>}</View></View>
   <View style={[e.row,e.rowLast]}><RowIcon icon="wallet" tint={C.success}/><View style={e.grow}><Text style={e.title}>{t('Владельцы платят вам напрямую')}</Text><Text style={e.note}>{t('{paid} оплачено · {waiting} ждут',{paid:w.paid,waiting:w.waiting})}</Text></View></View>
  </View>
 </View>;
}

const e=StyleSheet.create({
 box:{gap:16},
 head:{gap:2},
 caption:{...type.label,color:C.muted},
 sum:{...type.display,color:C.ink,fontWeight:'800',fontVariant:['tabular-nums']},
 facts:{...type.label,color:C.muted},
 bars:{flexDirection:'row',alignItems:'flex-end',gap:8,height:144},
 col:{flex:1,alignItems:'center',gap:8},
 track:{height:112,width:'100%',justifyContent:'flex-end'},
 bar:{width:'100%',borderRadius:T.radius.sm,backgroundColor:C.surfaceAlt},
 barDone:{backgroundColor:C.successSoft},
 barNow:{backgroundColor:C.success},
 day:{...type.caption,color:C.muted},
 dayNow:{color:C.ink,fontWeight:'700'},
 status:{gap:8,padding:16,borderRadius:T.radius.lg,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},
 statusHead:{flexDirection:'row',alignItems:'center',gap:8},
 statusTag:{...type.caption,color:C.ink,fontWeight:'700',marginLeft:'auto',paddingHorizontal:8,paddingVertical:4,borderRadius:T.radius.full,backgroundColor:C.surfaceAlt,overflow:'hidden'},
 statusText:{...type.label,color:C.inkSoft},
 rows:{borderRadius:T.radius.lg,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,paddingHorizontal:16},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.line},
 rowLast:{borderBottomWidth:0},
 grow:{flex:1,minWidth:0,gap:2},
 title:{...type.body,color:C.ink,fontWeight:'600'},
 note:{...type.caption,color:C.muted},
});
