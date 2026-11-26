import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C} from './styles';
import {BrandEmpty} from './BrandMoments';
import {journalClock,journalGroups,journalMeta,type JournalLine,type JournalOpen} from '../../lib/ai-move-marks';

// The journal of the AI administrator in the menu: what it did for this person, as a timeline under the heads of
// the days, the newest first (the site: components/ai-journal.tsx). As the concept of the menu: plain lines with the
// time on the right, no coloured dots. An entry says the step, the home, and who and
// when; it opens the card of the cleaning or of the booking, the home on the map, or the chat.
// Three entries are shown, the rest open in place.
export type JournalEntry=JournalLine;
export function AiJournal({entries,now,onOpen}:{entries:JournalEntry[];now:number;onOpen?:(open:JournalOpen)=>(()=>void)|undefined}){
 const [all,setAll]=useState(false),shown=all?entries:entries.slice(0,3);
 if(!entries.length)return <BrandEmpty title={t('Пока пусто')} text={t('Здесь появится короткая запись о каждом действии ИИ: что подтвердил, кого назначил, о чём напомнил.')}/>;
 return <View>
  {journalGroups(shown,now).map(g=><View key={g.day}>
   <Text accessibilityRole="header" style={j.day}>{g.day.toUpperCase()}</Text>
   {g.lines.map((e,i)=>{
    const go=e.open?onOpen?.(e.open):undefined,meta=journalMeta(e);
    const body=<>
     <View style={j.text}><View style={j.head}><Text style={j.what}>{e.text}</Text><Text style={j.when}>{journalClock(e.at)}</Text></View>{!!e.title&&<Text numberOfLines={1} style={j.title}>{e.title}</Text>}{!!meta&&<Text style={j.meta}>{meta}</Text>}</View>
     {!!go&&<Text style={j.go}>›</Text>}
    </>;
    return go?<Pressable key={e.at+':'+i} accessibilityRole="button" accessibilityHint={t('Открыть')} onPress={go} style={({pressed})=>[j.line,pressed&&j.pressed]}>{body}</Pressable>
     :<View key={e.at+':'+i} style={j.line}>{body}</View>;
   })}
  </View>)}
  {entries.length>3&&<Pressable accessibilityRole="button" accessibilityState={{expanded:all}} onPress={()=>setAll(v=>!v)} style={j.more}><Text style={j.moreText}>{all?t('Свернуть'):t('Показать все · {length}',{length:entries.length})}</Text></Pressable>}
 </View>;
}
const j=StyleSheet.create({
 day:{paddingHorizontal:16,paddingTop:12,paddingBottom:4,fontSize:12,lineHeight:16,fontWeight:'600',letterSpacing:.5,color:C.muted},
 line:{flexDirection:'row',gap:12,minHeight:56,paddingHorizontal:16,alignItems:'stretch',borderBottomWidth:1,borderBottomColor:C.line},pressed:{backgroundColor:C.surfaceAlt},
 text:{flex:1,gap:2,paddingVertical:8},head:{flexDirection:'row',gap:8,alignItems:'baseline',justifyContent:'space-between'},what:{flex:1,fontSize:16,lineHeight:20,fontWeight:'500',color:C.ink},title:{fontSize:14,lineHeight:20,color:C.muted},meta:{fontSize:12,lineHeight:16,color:C.muted},
 when:{fontSize:12,lineHeight:20,color:C.muted,fontVariant:['tabular-nums']},go:{alignSelf:'center',fontSize:16,lineHeight:20,color:C.muted},
 more:{minHeight:44,alignItems:'center',justifyContent:'center'},moreText:{fontSize:14,fontWeight:'600',color:C.ink},
 empty:{padding:12,fontSize:14,lineHeight:20,color:C.muted}
});
