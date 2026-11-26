import {t as tr,tc} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,Text,ScrollView,StyleSheet,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Photo} from './ListingMedia';
import type {Row} from './model';
import {cleaningTime,jobPlace} from '../../lib/job-place';
const R=T.radius;

// The place to clean, as on the site (components/job-place.tsx): photos to swipe, the kind of housing, the area of
// the city with the address hidden until the assignment, its size and what to clean.
// compact: one row for a list of jobs, with the first photo and the short line.
export function JobPlace({job,compact=false}:{job:Row;compact?:boolean}){
 const v=jobPlace(job),alt=tr('Фото жилья: {v}',{v:job.title||v.kind}),[width,setWidth]=useState(0),[page,setPage]=useState(0);
 if(compact)return <View style={p.row}>
  <View style={p.thumb}><Photo id={v.photos[0]} fill alt={alt}/>{v.photos.length>1&&<Text style={p.thumbCount}>{v.photos.length}</Text>}</View>
  <View style={p.rowText}><Text numberOfLines={1} style={p.rowTitle}>{v.summary}</Text>{!!(v.street||v.where)&&<Text numberOfLines={1} style={p.rowNote}>{v.street||v.where}</Text>}{!!v.tasks.length&&<Text numberOfLines={1} style={p.rowNote}>{v.tasks.join(' · ')}</Text>}</View>
 </View>;
 const shown=v.photos.slice(0,8),onScroll=(e:NativeSyntheticEvent<NativeScrollEvent>)=>{if(width)setPage(Math.round(e.nativeEvent.contentOffset.x/width));};
 return <View style={p.card} accessibilityLabel={tr('Жильё для уборки')}>
  {/* Without photos there is no empty half-screen: the kind of housing opens the first line instead (concept, Wolt). */}
  {shown.length>0&&<View style={p.gallery} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
   {width?<ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={onScroll} scrollEventThrottle={64}>
     {shown.map((id,i)=><View key={id} style={{width,height:'100%'}}><Photo id={id} fill alt={shown.length>1?tr('Фото жилья: {v}, {n} из {length}',{v:job.title||v.kind,n:i+1,length:shown.length}):alt}/></View>)}
    </ScrollView>
    :null}
   <Text style={p.kind}>{v.kind}</Text>
   {shown.length>1&&<View style={p.dots}>{shown.map((id,i)=><View key={id} style={[p.dot,i===page&&p.dotOn]}/>)}</View>}
  </View>}
  <View style={p.body}>
   <View style={{gap:2}}>{!shown.length&&<Text style={p.lock}>{v.kind} · {tr('Владелец ещё не добавил фото')}</Text>}<Text style={p.where}>{v.street||v.where||tr('Район не указан')}</Text>{(v.street?[v.where,v.floor]:[v.floor]).filter(Boolean).length>0&&<Text style={p.lock}>{(v.street?[v.where,v.floor]:[v.floor]).filter(Boolean).join(' · ')}</Text>}{!v.exact&&<Text style={p.lock}>{v.street?tr('Квартира и контакт откроются после назначения'):tr('Точный адрес откроется после назначения')}</Text>}</View>
   {v.facts.length>0&&<Text style={p.factLine}>{v.facts.map(f=>f.value+' '+f.label).join(' · ')}</Text>}
   {v.tasks.length>0&&<View style={{gap:8}}>
    <View style={p.todoHead}><Text style={p.todoTitle}>{tr('Что убрать')}</Text>{v.minutes>0&&<Text style={p.time}>{cleaningTime(v.minutes)}</Text>}</View>
    {v.tasks.map(t=><View key={t} style={p.task}><View style={p.check}><View style={p.checkMark}/></View><Text style={p.taskText}>{t}</Text></View>)}
   </View>}
   {v.kit.length>0&&<View style={p.kit}><Text style={p.kitLabel}>{tc('На месте','kit')}</Text>{v.kit.map(k=><Text key={k} style={p.chip}>{k}</Text>)}</View>}
  </View>
 </View>;
}

const p=StyleSheet.create({
 card:{overflow:'hidden',borderRadius:R.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 gallery:{width:'100%',aspectRatio:1.6,backgroundColor:C.surfaceAlt},
 empty:{flex:1,alignItems:'center',justifyContent:'center',gap:8,backgroundColor:C.accentSoft},emptyIcon:{fontSize:36,lineHeight:40,color:C.accent},emptyText:{...type.caption,color:C.muted},
 kind:{position:'absolute',left:12,top:12,...type.caption,fontWeight:'600',color:C.ink,paddingHorizontal:12,paddingVertical:8,borderRadius:R.full,overflow:'hidden',backgroundColor:'rgba(255,255,255,0.9)'},
 dots:{position:'absolute',bottom:10,left:0,right:0,flexDirection:'row',justifyContent:'center',gap:8},dot:{width:6,height:6,borderRadius:4,backgroundColor:'rgba(255,255,255,0.6)'},dotOn:{width:18,backgroundColor:C.surface},
 body:{gap:16,padding:16},
 where:{...type.body,fontWeight:'600',color:C.ink},lock:{...type.caption,color:C.muted},
 facts:{flexDirection:'row',flexWrap:'wrap',gap:8},
 fact:{flexGrow:1,flexBasis:'40%',flexDirection:'row',alignItems:'baseline',gap:8,paddingVertical:12,paddingHorizontal:12,borderRadius:R.md,backgroundColor:C.surfaceAlt},
 factValue:{...type.body,fontWeight:'700',color:C.ink},factLine:{...type.label,color:C.inkSoft},factLabel:{...type.caption,color:C.muted},
 todoHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},todoTitle:{...type.label,fontWeight:'600',color:C.ink},
 time:{...type.caption,fontWeight:'600',color:C.muted},
 task:{flexDirection:'row',alignItems:'flex-start',gap:8},
 check:{width:18,height:18,marginTop:4,borderRadius:8,borderWidth:1.5,borderColor:C.ink,alignItems:'center',justifyContent:'center'},
 checkMark:{width:5,height:9,marginTop:-2,borderRightWidth:1.5,borderBottomWidth:1.5,borderColor:C.ink,transform:[{rotate:'45deg'}]},
 taskText:{...type.body,color:C.inkSoft,flex:1},
 kit:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},kitLabel:{...type.caption,color:C.muted,marginRight:4},
 chip:{...type.caption,color:C.inkSoft,paddingHorizontal:12,paddingVertical:4,borderRadius:R.full,borderWidth:1,borderColor:C.line,overflow:'hidden'},
 row:{flexDirection:'row',alignItems:'center',gap:12},
 thumb:{width:64,height:64,borderRadius:R.md,overflow:'hidden',backgroundColor:C.surfaceAlt},
 thumbCount:{position:'absolute',right:4,bottom:4,minWidth:20,paddingHorizontal:8,borderRadius:R.full,overflow:'hidden',backgroundColor:'rgba(14,19,36,0.6)',color:C.onAccent,fontSize:12,lineHeight:20,textAlign:'center'},
 rowText:{flex:1,minWidth:0,gap:2},rowTitle:{...type.label,fontWeight:'600',color:C.ink},rowNote:{...type.caption,color:C.muted},
});
