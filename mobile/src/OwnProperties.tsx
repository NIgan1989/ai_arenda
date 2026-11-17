// «Моё жильё»: the owner's objects as short cards, opened from the «Жильё» shortcut of the home sheet.
// A card says what it is, its state, its price and what is happening there now; a tap opens the facts and
// the actions. Changing an object is the step editor (PropertyEdit), adding one is the AI form (PropertyQuick).
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {money,type Row} from './model';
import {Photo} from './ListingMedia';
import {RecordFacts,RecordActions,type RecordAction} from './RecordCard';
import {propertyTypes,isBath} from '../../lib/listings';
import {processStatus} from '../../lib/process-status';
import {clock} from '../../lib/rental-policy';
import {placeNow} from './own-place';
import {BusyMark,busyNow,hhmm} from './BusyMark';

const tones:Record<string,[string,string]>={success:[C.successSoft,C.success],warning:[C.warningSoft,C.warning],active:[C.accentSoft,C.accentPressed],neutral:[C.surfaceAlt,C.muted],danger:[C.dangerSoft,C.danger]};

type Props={properties:Row[];bookings:Row[];busy:boolean;onAdd?:()=>void;onEdit:(id:string)=>void;onSettings:(id:string)=>void;onCleaning:(id:string)=>void;onMap:(id:string)=>(()=>void)|undefined};

export function OwnProperties({properties,bookings,busy,onAdd,onEdit,onSettings,onCleaning,onMap}:Props){
 const [open,setOpen]=useState(properties.length===1?properties[0].id:'');
 return <View style={o.list}>
  {!!onAdd&&<Pressable accessibilityRole="button" accessibilityLabel="Добавить жильё" disabled={busy} onPress={onAdd} style={({pressed})=>[o.add,(pressed||busy)&&o.dim]}>
   <View style={o.addOrb}><Text style={o.addPlus}>+</Text></View>
   <View style={o.grow}><Text style={o.addTitle}>Добавить жильё</Text><Text style={o.addSub}>Расскажите одним сообщением, ИИ заполнит объявление</Text></View>
  </Pressable>}
  {!properties.length&&<Text style={o.empty}>Здесь появятся ваши объекты: их состояние, брони и цена.</Text>}
  {properties.map(p=><PropertyCard key={p.id} property={p} bookings={bookings} busy={busy} open={open===p.id} onToggle={()=>setOpen((v:string)=>v===p.id?'':p.id)} onEdit={()=>onEdit(p.id)} onSettings={()=>onSettings(p.id)} onCleaning={()=>onCleaning(p.id)} onMap={onMap(p.id)}/>)}
 </View>;
}

function PropertyCard({property:p,bookings,busy,open,onToggle,onEdit,onSettings,onCleaning,onMap}:{property:Row;bookings:Row[];busy:boolean;open:boolean;onToggle:()=>void;onEdit:()=>void;onSettings:()=>void;onCleaning:()=>void;onMap?:()=>void}){
 const d=p.details||{},policy=p.policy||{},found=processStatus('property',p,'owner',''),status=isBath((p.details||{}).type)?{...found,label:found.label.replace('к заселению','к приёму гостей')}:found,[bg,ink]=tones[status.tone]||tones.neutral,bath=isBath(d.type),now=placeNow(p.id,bookings,undefined,bath);
 const kind=propertyTypes[d.type]||'Жильё';
 // «Занято»: guests who came without the service. The card keeps the mark it was given until the state is read again.
 const [marked,setMarked]=useState<Row[]|null>(null),[busyOpen,setBusyOpen]=useState(false),[busyNote,setBusyNote]=useState('');
 // A fresh state of the object wins over the local mark: the person on shift may have marked or freed it meanwhile.
 useEffect(()=>{setMarked(null);},[p.busy_until]);
 const blocks=marked??(Number(p.busy_until)>Date.now()/1000?[{start:0,end:Number(p.busy_until)}]:[]),held=busyNow(blocks);
 const actions:(RecordAction|false)[]=[
  {title:'Изменить',kind:'main',onPress:onEdit},
  !Number(p.own_staff)&&{title:'Уборка',kind:'side',onPress:onCleaning},
  {title:'Правила',kind:'side',onPress:onSettings},
  !!onMap&&{title:'На карте',kind:'side',onPress:onMap},
  !now.busy&&{title:'Занято',kind:'side',onPress:()=>{setBusyNote('');setBusyOpen(v=>!v);}},
 ];
 return <View style={[o.card,open&&o.cardOpen]}>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} accessibilityLabel={p.title+'. '+status.label+'. '+now.line+(open?'. Свернуть':'. Подробнее')} onPress={onToggle} style={({pressed})=>[o.row,pressed&&o.dim]}>
   <View style={o.thumb}><Photo id={p.photos?.[0]} alt={p.title} fill/></View>
   <View style={o.grow}>
    <Text numberOfLines={1} style={o.title}>{p.title}</Text>
    <Text numberOfLines={1} style={o.meta}>{p.venue&&p.venue.title!==p.title?p.venue.title:kind} · {bath&&policy.hourly_price?money(policy.hourly_price)+' / час':money(p.price)+' / сутки'}</Text>
    <View style={o.tags}><Text style={[o.status,{backgroundColor:bg,color:ink}]}>{status.label}</Text>{!!p.address_check&&<Text style={[o.status,{backgroundColor:C.warningSoft,color:C.warning}]}>Адрес на проверке</Text>}{!!held&&<Text style={[o.status,{backgroundColor:C.warningSoft,color:C.warning}]}>Занято до {hhmm(Number(held.end))}</Text>}{!!p.demo_owner&&<Text style={[o.status,{backgroundColor:C.surfaceAlt,color:C.muted}]}>Учебный</Text>}</View>
   </View>
   <Text style={[o.chevron,open&&o.chevronOpen]}>›</Text>
  </Pressable>
  <View style={o.nowRow}><View style={[o.dot,{backgroundColor:now.busy?C.accent:status.tone==='success'?C.success:C.muted}]}/><Text numberOfLines={1} style={o.now}>{now.line}{now.requests?' · заявок: '+now.requests:''}</Text></View>
  {open&&<>
   <RecordFacts rows={[
    ['Адрес',[p.city,p.district,p.address].filter(Boolean).join(', ')],
    ['Гостей',bath?'до '+(p.capacity||1)+(d.area?' · '+d.area+' м²':''):(p.capacity||1)+' · '+(p.rooms||1)+' комн.'+(d.area?' · '+d.area+' м²':'')],
    ['Цена',bath&&policy.hourly_price?money(policy.hourly_price)+' / ч'+(policy.min_hours?' · от '+policy.min_hours+' ч':''):money(p.price)+' / сутки'+(policy.hourly_price?' · '+money(policy.hourly_price)+' / ч':'')],
    !bath&&['Заезд',clock(policy.checkin_minutes??840)+' · выезд '+clock(policy.checkout_minutes??720)],
    ['Фото',p.photos?.length?String(p.photos.length):'нет, добавьте, чтобы показать гостям'],
    p.rating?.count>0&&['Оценка','★ '+String(p.rating.average).replace('.',',')+' ('+p.rating.count+')'],
   ]}/>
   <RecordActions busy={busy} actions={actions}/>
   {busyOpen&&!now.busy&&<BusyMark propertyId={p.id} busy={blocks} onChange={(next,message)=>{setMarked(next);setBusyNote(message);}}/>}
   {!!busyNote&&!held&&<Text accessibilityLiveRegion="polite" style={o.note}>{busyNote}</Text>}
  </>}
 </View>;
}

const R=T.radius,H=T.control;
const o=StyleSheet.create({
 list:{gap:12,marginTop:4},grow:{flex:1,minWidth:0,gap:4},dim:{opacity:.55},
 add:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.primary,padding:12,borderRadius:R.xl,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.glassLine},
 addOrb:{width:40,height:40,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},addPlus:{...type.title,color:C.onAccent,fontWeight:'600',marginTop:-2},
 addTitle:{...type.body,color:C.accentPressed,fontWeight:'700'},addSub:{...type.caption,color:C.inkSoft},
 empty:{...type.label,color:C.muted,textAlign:'center',paddingVertical:16},note:{...type.caption,color:C.inkSoft,paddingHorizontal:4},
 card:{gap:12,padding:12,borderRadius:R.xl,borderWidth:1,borderColor:C.glassLine,backgroundColor:C.glassStrong},cardOpen:{borderColor:C.accentSoft},
 row:{flexDirection:'row',alignItems:'center',gap:12},
 thumb:{width:72,height:72,borderRadius:R.lg,overflow:'hidden',backgroundColor:C.surfaceAlt},
 title:{...type.body,color:C.ink,fontWeight:'700'},meta:{...type.label,color:C.inkSoft},
 tags:{flexDirection:'row',flexWrap:'wrap',gap:8},status:{...type.caption,fontWeight:'500',paddingHorizontal:8,paddingVertical:2,borderRadius:R.sm,overflow:'hidden'},
 chevron:{...type.title,color:C.muted,paddingHorizontal:4},chevronOpen:{transform:[{rotate:'90deg'}]},
 nowRow:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:4},dot:{width:8,height:8,borderRadius:R.full},now:{...type.label,color:C.inkSoft,flex:1},
});
