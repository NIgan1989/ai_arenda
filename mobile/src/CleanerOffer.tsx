import {t} from '../../lib/i18n';
import React,{useEffect} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {checkinMethods} from '../../lib/listings';
import {recordSpan} from '../../lib/record-span';
import {C,type} from './styles';
import {T} from './tokens';
import {SwipeConfirm} from './SwipeConfirm';
import {feeLabel} from './cleaner-map';
import {useActivityClock} from './ActivityTimer';

type Row=Record<string,any>;

// «Новое задание» of the cleaner, as an order in a taxi app (concept of 2026-11-25): the money large, what kind of
// cleaning, where and when in two rows, how the keys are handed over, then one swipe. «Пропустить» shows the next job.
// The swipe sends a response (apply): the owner picks the cleaner, so the card says so and does not promise the job.
// `offer`: the cleaning was offered to this person (by the autopilot or the owner) with a time to answer
// (lib/dispatch.ts, cleanerOffers). Then the time left goes round, the swipe takes it and «Отказаться» passes it on.
export function CleanerOffer({job,left,busy,onApply,onSkip,onOpen,offer,onExpire}:{job:Row;left:number;busy:boolean;onApply:()=>void;onSkip:()=>void;onOpen:()=>void;offer?:Row;onExpire?:()=>void}){
 let details:Row={};try{details=typeof job.property_details==='string'?JSON.parse(job.property_details||'{}'):job.property_details||{};}catch{details={};}
 const rooms=Number(job.rooms)||0,kind=job.booking_id?t('Уборка после гостя'):t('Уборка');
 const where=[job.district,job.open_address].filter(Boolean).join(' · ')||job.city||t('Адрес после назначения');
 const keys=checkinMethods[details.checkinMethod]?t(checkinMethods[details.checkinMethod]):'';
 const now=useActivityClock()||Math.floor(Date.now()/1000),until=Number(offer?.expires_at)||0,rest=offer?Math.max(0,until-now):0;
 const share=offer?Math.min(1,rest/Math.max(60,until-(Number(offer.created_at)||until-600))):0,mm=Math.floor(rest/60),ss=String(rest%60).padStart(2,'0');
 useEffect(()=>{if(offer&&rest<=0)onExpire?.();},[offer?.id,rest<=0]);
 const fee=feeLabel(offer?Number(offer.fee):job.fee),when=offer?recordSpan(Number(offer.start),Number(offer.end)):recordSpan(job.start,job.end);
 return <View style={o.card}>
  <Pressable accessibilityRole="button" accessibilityLabel={(offer?t('Вам предлагают уборку: {title}, {fee}. Подробнее',{title:job.title,fee}):t('Новое задание: {title}, {fee}. Подробнее',{title:job.title,fee}))} onPress={onOpen} style={({pressed})=>[o.head,pressed&&o.dim]}>
   <View style={o.grow}><Text style={o.caption}>{offer?t('Вам предлагают уборку'):t('Новое задание')}</Text><Text style={o.fee}>{fee}</Text><Text numberOfLines={1} style={o.kind}>{[kind,rooms?t('{n} комн.',{n:rooms}):''].filter(Boolean).join(' · ')}</Text></View>
   {offer?<View accessible accessibilityLabel={t('На ответ осталось {v}',{v:mm+':'+ss})} style={o.ring}><View style={[o.arc,o.track]}/><View style={[o.arc,{borderTopColor:share>0?C.ink:'transparent',borderRightColor:share>.25?C.ink:'transparent',borderBottomColor:share>.5?C.ink:'transparent',borderLeftColor:share>.75?C.ink:'transparent'}]}/><Text style={o.ringTime}>{mm}:{ss}</Text><Text style={o.ringNote}>{t('на ответ')}</Text></View>
   :left>0&&<View style={o.more}><Text style={o.moreText}>{t('ещё {n}',{n:left})}</Text></View>}
  </Pressable>
  <View style={o.row}><Text style={o.key}>{t('Где')}</Text><Text numberOfLines={2} style={o.value}>{where}</Text></View>
  <View style={[o.row,o.rowLast]}><View style={o.grow}><Text style={o.key}>{t('Когда')}</Text><Text style={o.value}>{when}</Text></View>{!!keys&&<Text style={o.tag}>{keys}</Text>}</View>
  <SwipeConfirm label={offer?t('Проведите, чтобы взять'):t('Проведите, чтобы откликнуться')} disabled={busy} onConfirm={onApply}/>
  <Pressable accessibilityRole="button" accessibilityLabel={offer?t('Отказаться от уборки'):t('Пропустить задание')} disabled={busy} onPress={onSkip} style={({pressed})=>[o.skip,(pressed||busy)&&o.dim]}><Text style={o.skipText}>{offer?t('Отказаться'):t('Пропустить')}</Text></Pressable>
 </View>;
}

const o=StyleSheet.create({
 card:{gap:12,padding:16,borderRadius:T.radius.xl,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},
 head:{flexDirection:'row',alignItems:'flex-start',gap:12},
 grow:{flex:1,minWidth:0},
 caption:{...type.caption,color:C.muted},
 fee:{...type.heading,color:C.ink,fontWeight:'800',fontVariant:['tabular-nums']},
 kind:{...type.label,color:C.muted},
 more:{minHeight:32,paddingHorizontal:12,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center',backgroundColor:C.surfaceAlt},
 moreText:{...type.caption,color:C.ink,fontWeight:'600'},
 ring:{width:84,height:84,alignItems:'center',justifyContent:'center'},
 arc:{position:'absolute',top:0,left:0,width:84,height:84,borderRadius:T.radius.full,borderWidth:6,borderColor:'transparent',transform:[{rotate:'45deg'}]},
 track:{borderColor:C.surfaceAlt},
 ringTime:{...type.body,color:C.ink,fontWeight:'800',fontVariant:['tabular-nums']},
 ringNote:{...type.caption,color:C.muted,marginTop:-2},
 row:{gap:2,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.line},
 rowLast:{flexDirection:'row',alignItems:'center',gap:12},
 key:{...type.caption,color:C.muted},
 value:{...type.body,color:C.ink,fontWeight:'600'},
 tag:{...type.caption,color:C.success,fontWeight:'700',paddingHorizontal:8,paddingVertical:4,borderRadius:T.radius.full,backgroundColor:C.successSoft,overflow:'hidden'},
 skip:{minHeight:44,alignItems:'center',justifyContent:'center'},
 skipText:{...type.label,color:C.muted,fontWeight:'600'},
 dim:{opacity:.6},
});
