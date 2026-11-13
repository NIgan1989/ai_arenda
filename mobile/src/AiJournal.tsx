import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C} from './styles';
import {journalWhen} from '../../lib/ai-move-marks';

// The journal of the AI administrator in the menu: what it did for this person, one short line each, the newest first.
// Three lines are shown, the rest open in place (the site: components/ai-journal.tsx).
export type JournalEntry={at:number;text:string;title:string};
export function AiJournal({entries,now}:{entries:JournalEntry[];now:number}){
 const [all,setAll]=useState(false),shown=all?entries:entries.slice(0,3);
 if(!entries.length)return <Text style={j.empty}>Здесь появится короткая запись о каждом действии ИИ: что подтвердил, кого назначил, о чём напомнил.</Text>;
 return <View>
  {shown.map((e,i)=><View key={e.at+':'+i} style={[j.line,i>0&&j.next]}><Text style={j.when}>{journalWhen(e.at,now)}</Text><Text style={j.text}><Text style={j.what}>{e.text}</Text>{!!e.title&&<Text style={j.title}> · {e.title}</Text>}</Text></View>)}
  {entries.length>3&&<Pressable accessibilityRole="button" accessibilityState={{expanded:all}} onPress={()=>setAll(v=>!v)} style={[j.more,j.next]}><Text style={j.moreText}>{all?'Свернуть':'Показать все · '+entries.length}</Text></Pressable>}
 </View>;
}
const j=StyleSheet.create({
 line:{flexDirection:'row',gap:8,paddingHorizontal:12,paddingVertical:8,alignItems:'baseline'},next:{borderTopWidth:1,borderTopColor:C.line},
 when:{width:96,fontSize:12,lineHeight:16,color:C.muted},text:{flex:1,fontSize:14,lineHeight:20},what:{fontWeight:'600',color:C.ink},title:{color:C.muted},
 more:{minHeight:44,alignItems:'center',justifyContent:'center'},moreText:{fontSize:14,fontWeight:'600',color:C.accent},
 empty:{padding:12,fontSize:14,lineHeight:20,color:C.muted}
});
