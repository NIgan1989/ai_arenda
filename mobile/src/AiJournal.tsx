import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C} from './styles';
import {journalWhen,type JournalLine,type JournalOpen} from '../../lib/ai-move-marks';

// The journal of the AI administrator in the menu: what it did for this person, one short line each, the newest first.
// Three lines are shown, the rest open in place (the site: components/ai-journal.tsx).
// A line opens what it is about: the card of the cleaning or of the booking, the home on the map, or the chat.
export type JournalEntry=JournalLine;
export function AiJournal({entries,now,onOpen}:{entries:JournalEntry[];now:number;onOpen?:(open:JournalOpen)=>(()=>void)|undefined}){
 const [all,setAll]=useState(false),shown=all?entries:entries.slice(0,3);
 if(!entries.length)return <Text style={j.empty}>Здесь появится короткая запись о каждом действии ИИ: что подтвердил, кого назначил, о чём напомнил.</Text>;
 return <View>
  {shown.map((e,i)=>{
   const go=e.open?onOpen?.(e.open):undefined,line=<><Text style={j.when}>{journalWhen(e.at,now)}</Text><Text style={j.text}><Text style={j.what}>{e.text}</Text>{!!e.title&&<Text style={j.title}> · {e.title}</Text>}</Text></>;
   return go?<Pressable key={e.at+':'+i} accessibilityRole="button" accessibilityHint="Открыть" onPress={go} style={({pressed})=>[j.line,i>0&&j.next,pressed&&j.pressed]}>{line}<Text style={j.go}>›</Text></Pressable>
    :<View key={e.at+':'+i} style={[j.line,i>0&&j.next]}>{line}</View>;
  })}
  {entries.length>3&&<Pressable accessibilityRole="button" accessibilityState={{expanded:all}} onPress={()=>setAll(v=>!v)} style={[j.more,j.next]}><Text style={j.moreText}>{all?'Свернуть':'Показать все · '+entries.length}</Text></Pressable>}
 </View>;
}
const j=StyleSheet.create({
 line:{flexDirection:'row',gap:8,minHeight:44,paddingHorizontal:12,paddingVertical:8,alignItems:'baseline'},pressed:{backgroundColor:C.accentSoft},go:{fontSize:16,lineHeight:20,color:C.muted},next:{borderTopWidth:1,borderTopColor:C.line},
 when:{width:96,fontSize:12,lineHeight:16,color:C.muted},text:{flex:1,fontSize:14,lineHeight:20},what:{fontWeight:'600',color:C.ink},title:{color:C.muted},
 more:{minHeight:44,alignItems:'center',justifyContent:'center'},moreText:{fontSize:14,fontWeight:'600',color:C.accent},
 empty:{padding:12,fontSize:14,lineHeight:20,color:C.muted}
});
