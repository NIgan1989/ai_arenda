import {t} from '../../lib/i18n';
// «Номера одного типа» (lib/room-units.ts): a hotel, a hostel, an apart-hotel or a holiday resort fills one card for
// all its rooms alike and says how many there are. Guests see one card and how many of its rooms are free. «Свободно
// сегодня» is the one number the hotel gives from its own system: the rest of the rooms are closed until midnight.
import React,{useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Stepper} from './SheetParts';
import {C,type} from './styles';
import {T} from './tokens';
type Row=Record<string,any>;

export function RoomCount({property,call,onChanged}:{property:Row;call:(path:string,body:Row)=>Promise<any>;onChanged?:(rooms:Row)=>void}){
 const start:Row=property.units||{total:1,free:1,taken:0,closed:0};
 const [rooms,setRooms]=useState<Row>(start),[count,setCount]=useState(Number(start.total)||1),[free,setFree]=useState(Number(start.free)||0);
 const [busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
 async function save(path:string,body:Row){setBusy(true);setError('');setNote('');try{const r=await call(path,{propertyId:property.id,...body});setRooms(r.rooms);setCount(r.rooms.total);setFree(r.rooms.free);setNote(r.message||'');onChanged?.(r.rooms);}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 const open=Math.max(0,Number(rooms.total)-Number(rooms.taken||0));
 return <View style={s.box}>
  <Text style={s.title}>{t('Номера этого типа')}</Text>
  <Text style={s.hint}>{t('Одна карточка на все одинаковые номера. Гость видит, сколько из них свободно.')}</Text>
  <Stepper label={t('Таких номеров')} value={count} text={String(count)} min={1} max={200} disabled={busy} onChange={setCount}/>
  {count!==Number(rooms.total)&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>save('rooms/count',{count})} style={({pressed})=>[s.button,(pressed||busy)&&s.dim]}><Text style={s.buttonText}>{t('Сохранить: {n} номеров',{n:count})}</Text></Pressable>}
  {Number(rooms.total)>1&&<>
   <Stepper label={t('Свободно сегодня')} value={free} text={t('{free} из {total}',{free,total:rooms.total})} min={0} max={open} disabled={busy} onChange={setFree}/>
   <Text style={s.hint}>{t('Через нас занято: {taken}. Закрыто вами: {closed}.',{taken:rooms.taken||0,closed:rooms.closed||0})}</Text>
   {free!==Number(rooms.free)&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>save('rooms/free',{free})} style={({pressed})=>[s.button,(pressed||busy)&&s.dim]}><Text style={s.buttonText}>{t('Сохранить: свободно {n}',{n:free})}</Text></Pressable>}
  </>}
  {!!note&&<Text accessibilityLiveRegion="polite" style={s.note}>{note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </View>;
}
const s=StyleSheet.create({
 box:{gap:8,padding:16,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,width:'100%'},
 title:{...type.label,color:C.ink,fontWeight:'700'},hint:{...type.caption,color:C.muted},
 button:{minHeight:44,borderRadius:T.radius.md,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:16},buttonText:{...type.label,color:C.onAccent,fontWeight:'700'},
 dim:{opacity:0.6},note:{...type.caption,color:C.success},error:{...type.caption,color:C.danger},
});
