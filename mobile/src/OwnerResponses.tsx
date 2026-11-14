import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import {ApplicantPick} from './ApplicantPick';
import type {Row} from './model';
import {jobPlace} from '../../lib/job-place';
const R=T.radius;
const when=(v:number)=>new Date(v*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+'\u00a0₸';

// Same as components/owner-responses.tsx: on the owner's «Заявки», cleaners who answered his open cleanings come first,
// each cleaning in one line with «Назначить» / «Отклонить» on every response under it.
export function OwnerResponses({rows,approvals,busy,onDecide,onOpen}:{rows:{job:Row;applications:Row[]}[];approvals:Row[];busy:boolean;onDecide:(body:Row)=>void;onOpen:(jobId:string)=>void}){
 if(!rows.length)return null;
 const total=rows.reduce((n,r)=>n+r.applications.length,0);
 return <View style={o.block} accessibilityLabel="Отклики исполнителей">
  <View style={o.head}><Text accessibilityRole="header" style={o.title}>Отклики исполнителей</Text><Text style={o.count}>{total}</Text></View>
  {rows.map(({job,applications})=><View key={job.id} style={o.card}>
   <Pressable accessibilityRole="button" accessibilityLabel={'Открыть уборку: '+job.title} onPress={()=>onOpen(job.id)} style={({pressed})=>[o.job,pressed&&{opacity:.7}]}>
    <View style={o.thumb}><Photo id={jobPlace(job).photos[0]} fill alt={'Фото: '+job.title}/></View>
    <View style={{flex:1,minWidth:0,gap:2}}><Text numberOfLines={1} style={o.jobTitle}>{job.title}</Text><Text style={o.jobNote}>Уборка · {when(job.start)} · {money(job.fee)}</Text></View>
    <Text style={o.chevron}>›</Text>
   </Pressable>
   <ApplicantPick bare applications={applications} approvals={approvals} busy={busy} onDecide={onDecide}/>
  </View>)}
 </View>;
}
const o=StyleSheet.create({
 block:{gap:12,marginTop:12,marginBottom:12},
 head:{flexDirection:'row',alignItems:'center',gap:8},title:{...type.subtitle,fontWeight:'700',color:C.ink},
 count:{...type.caption,fontWeight:'700',color:C.onAccent,backgroundColor:C.accent,minWidth:24,paddingHorizontal:8,paddingVertical:2,borderRadius:R.full,overflow:'hidden',textAlign:'center'},
 card:{overflow:'hidden',borderRadius:R.xl,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.surface},
 job:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.line},
 thumb:{width:56,height:56,borderRadius:R.md,overflow:'hidden',backgroundColor:C.surfaceAlt},
 jobTitle:{...type.body,fontWeight:'600',color:C.ink},jobNote:{...type.caption,color:C.muted},chevron:{fontSize:22,lineHeight:28,color:C.muted},
});
