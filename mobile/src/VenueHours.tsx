import {t as tr} from '../../lib/i18n';
// «Время работы» of a hall, cafe, bath or sauna in «Правила» (thread «Не назначать уборки на ночь», 2026-11-28): the
// place sets its own hours, a hall also its own times of events (a той from 15:00 to midnight, memorial sittings of an
// hour and a half…). The server checks and stores them (lib/venue-hours.ts) and a guest picks only these times.
import React from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {EditSwitch,EditButton,EditHeading,EditNote} from './EditSheet';
import {venueHours,hhmm} from '../../lib/venue-hours';
import {isBanquet} from '../../lib/listings';
import {type Row} from './model';
const R=T.radius;

export type VenueForm={open:string;close:string;sessions:{label:string;from:string;to:string}[]};
// The form of what is stored (or of the kind's default), times as «ЧЧ:ММ».
export function venueForm(kind:string,stored:unknown):VenueForm|null{
 const h=venueHours(kind,stored);if(!h)return null;
 return {open:hhmm(h.open),close:hhmm(h.close),sessions:h.sessions.map(s=>({label:s.label,from:hhmm(s.from),to:hhmm(s.to)}))};
}
const allDay=(v:VenueForm)=>v.open===v.close||v.open==='00:00'&&v.close==='24:00';
// A time typed as digits gets its colon: «1530» → «15:30».
const tidy=(x:string)=>{const d=x.replace(/[^\d:]/g,'').slice(0,5);return /^\d{3,4}$/.test(d)?d.slice(0,d.length-2)+':'+d.slice(-2):d;};
function Clock({label,value,onChange,disabled}:{label:string;value:string;onChange:(v:string)=>void;disabled:boolean}){
 return <TextInput accessibilityLabel={label} editable={!disabled} style={c.clock} keyboardType="numbers-and-punctuation" value={value} placeholder="00:00" placeholderTextColor={C.muted} maxLength={5} onChangeText={x=>onChange(tidy(x))}/>;
}
export function VenueHoursRows({kind,value,busy,cleaningMinutes,onChange}:{kind:string;value:VenueForm;busy:boolean;cleaningMinutes:number;onChange:(v:VenueForm)=>void}){
 const hall=isBanquet(kind),round=allDay(value);
 const session=(i:number,x:Partial<VenueForm['sessions'][number]>)=>onChange({...value,sessions:value.sessions.map((s,k)=>k===i?{...s,...x}:s)});
 return <>
  <EditHeading title={tr('Время работы')}/>
  <View>
   <EditSwitch icon="clock" title={tr('Круглосуточно')} line={round?tr('Гости бронируют в любое время'):tr('Гости бронируют только в эти часы')} value={round} disabled={busy} onChange={x=>onChange({...value,open:x?'00:00':'10:00',close:x?'24:00':'24:00'})} last={round}/>
   {!round&&<View style={c.hours}><View style={c.hoursText}><Text style={c.hoursTitle}>{tr('Открыто')}</Text><Text style={c.hoursNote}>{tr('Если закрываетесь после полуночи, укажите время следующего дня')}</Text></View><View style={c.pair}><Clock label={tr('Открывается')} value={value.open} disabled={busy} onChange={open=>onChange({...value,open})}/><Text style={c.dash}>–</Text><Clock label={tr('Закрывается')} value={value.close} disabled={busy} onChange={close=>onChange({...value,close})}/></View></View>}
  </View>
  {hall&&<>
   <EditHeading title={tr('Время мероприятий')}/>
   <EditNote text={tr('Гость выбирает одно из этих времён. Между мероприятиями зал готовят {n} мин.',{n:cleaningMinutes})}/>
   <View style={c.list}>{value.sessions.map((s,i)=><View key={i} style={c.session}>
    <TextInput accessibilityLabel={tr('Название времени')} editable={!busy} style={c.name} value={s.label} maxLength={40} placeholder={tr('Той, поминки…')} placeholderTextColor={C.muted} onChangeText={label=>session(i,{label})}/>
    <View style={c.pair}><Clock label={tr('Начало')} value={s.from} disabled={busy} onChange={from=>session(i,{from})}/><Text style={c.dash}>–</Text><Clock label={tr('Конец')} value={s.to} disabled={busy} onChange={to=>session(i,{to})}/>
     <Pressable accessibilityRole="button" accessibilityLabel={tr('Убрать время «{v}»',{v:s.label})} disabled={busy||value.sessions.length<2} onPress={()=>onChange({...value,sessions:value.sessions.filter((_,k)=>k!==i)})} style={({pressed})=>[c.remove,(busy||value.sessions.length<2)&&c.off,pressed&&c.dim]}><Text style={c.removeText}>×</Text></Pressable></View>
   </View>)}</View>
   {value.sessions.length<12&&<EditButton line title={tr('Добавить время')} disabled={busy} onPress={()=>onChange({...value,sessions:[...value.sessions,{label:'',from:'12:00',to:'15:00'}]})}/>}
  </>}
 </>;
}
// What goes to the server.
export const venueRequest=(v:VenueForm|null):Row=>v?{venueHours:{open:v.open,close:v.close,sessions:v.sessions.map(s=>({label:s.label.trim(),from:s.from,to:s.to}))}}:{};
const c=StyleSheet.create({
 pair:{flexDirection:'row',alignItems:'center',gap:8},
 dash:{...type.body,color:C.muted},
 clock:{...type.body,color:C.ink,fontWeight:'600',width:80,flexGrow:0,flexShrink:0,textAlign:'center',height:44,borderRadius:R.md,borderWidth:1,borderColor:C.line,paddingHorizontal:8,backgroundColor:C.surface},
 hours:{gap:12,paddingVertical:12},hoursText:{gap:4},hoursTitle:{...type.body,color:C.ink},hoursNote:{...type.caption,color:C.muted},
 list:{gap:8},
 session:{gap:8,padding:12,borderRadius:R.lg,backgroundColor:C.surfaceAlt},
 name:{...type.body,color:C.ink,minHeight:44,paddingHorizontal:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 remove:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:R.md},
 removeText:{...type.subtitle,color:C.ink},
 off:{opacity:0.3},dim:{opacity:0.6},
});
