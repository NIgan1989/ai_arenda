import {t} from '../../lib/i18n';
// «Анкета типа» (thread «Сделать формы под каждый тип жилья», 2026-11-28): step 2 of adding a place. The kind is known
// by now, so the form shows only its own sections: a home its size, day prices and keys; a hotel its room types; a bath
// its hours and heating; a hall its halls, price per guest and menu; a field or a table how many alike; a car place its
// boxes and services. The AI filled what it read from the story, «Проверьте» marks what it only guessed.
import React from 'react';
import {Platform,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {Stepper} from './SheetParts';
import {VenueHoursRows} from './VenueHours';
import {amenities,categoryAmenities,checkinMethods,isAuto,isBath,kindCategory,unitKinds,unitWords} from '../../lib/listings';
import {formKind,MAX_HALLS,MAX_ROOM_TYPES,MAX_UNITS,type FormExtras} from '../../lib/listing-forms';
import {MAX_SERVICES} from '../../lib/venue-services';
import type {ListingDraft} from '../../lib/listing-draft';
const R=T.radius,H=T.control;
const digits=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const minutesText=(m:number)=>m%60?(m>60?t('{h} ч {m} мин',{h:Math.floor(m/60),m:m%60}):t('{m} мин',{m})):t('{h} ч',{h:m/60});

type Props={draft:ListingDraft;extras:FormExtras;patch:(v:Partial<ListingDraft>)=>void;onExtras:(v:Partial<FormExtras>)=>void;guessed:(key:string)=>boolean;feeLine?:string};
export function TypeForm({draft:d,extras:x,patch,onExtras,guessed,feeLine}:Props){
 const form=formKind(d.type),car=isAuto(d.type),heated=isBath(d.type),category=kindCategory(d.type),words=unitWords(d.type);
 const any=(...keys:string[])=>keys.some(guessed);
 const sec=(id:string,title:string,body:React.ReactNode,guess=false)=><View key={id} style={f.sec}><Text accessibilityRole="header" style={f.secTitle}>{title}{guess?<Text style={f.guess}>{'  '}{t('Проверьте')}</Text>:null}</Text>{body}</View>;
 const money=(label:string,value:number,onChange:(v:number)=>void,max=10000000)=><View style={f.tile} key={label}><Text style={f.label}>{label}</Text><TextInput accessibilityLabel={label} style={f.value} keyboardType="number-pad" returnKeyType="done" value={value?digits(value):''} placeholder="0" placeholderTextColor={C.muted} onChangeText={v=>onChange(Math.min(max,Number(v.replace(/[^\d]/g,''))||0))}/></View>;
 const num=(key:keyof ListingDraft,label:string,max=10000000)=>money(label,Number(d[key])||0,v=>patch({[key]:v} as Partial<ListingDraft>),max);
 const text=(label:string,value:string,onChange:(v:string)=>void,max=120,placeholder='')=><View style={f.field} key={label}><Text style={f.label}>{label}</Text><TextInput accessibilityLabel={label} style={f.input} value={value} maxLength={max} placeholder={placeholder} placeholderTextColor={C.muted} onChangeText={onChange}/></View>;
 const chip=(key:string,label:string,on:boolean,onPress:()=>void,radio=false)=><Pressable key={key} accessibilityRole={radio?'radio':'checkbox'} accessibilityState={{checked:on}} onPress={onPress} style={[f.chip,on&&f.chipOn]}><Text style={[f.chipText,on&&f.chipTextOn]}>{on&&!radio?'✓ ':''}{label}</Text></Pressable>;
 const link=(label:string,onPress:()=>void)=><Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({pressed})=>[f.link,pressed&&{opacity:.55}]}><Text style={f.linkText}>{label}</Text></Pressable>;
 const remove=(label:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({pressed})=>pressed&&{opacity:.55}}><Text style={f.remove}>{t('Убрать')}</Text></Pressable>;
 const guests=(label:string,max=50,step=1)=><Stepper label={label} value={d.capacity} text={String(d.capacity)} min={1} max={max} step={step} onChange={v=>patch({capacity:v,beds:Math.max(d.beds,v)})}/>;

 const amenityList=sec('amenities',form==='bath'?t('Что внутри'):form==='hall'?t('Для праздника'):form==='stay'||form==='rooms'?t('Удобства'):t('Что есть'),<View style={f.chips}>{categoryAmenities[category].map(id=>{const on=d.amenities.includes(id);return chip(id,amenities[id],on,()=>patch({amenities:on?d.amenities.filter(a=>a!==id):[...d.amenities,id]}));})}</View>);
 const rules=form==='stay'||form==='rooms'?sec('rules',t('Правила'),<View style={f.chips}>{chip('pets',d.pets?t('Питомцы разрешены'):t('Без питомцев'),d.pets,()=>patch({pets:!d.pets}))}{chip('smoking',d.smoking?t('Курение разрешено'):t('Курение запрещено'),d.smoking,()=>patch({smoking:!d.smoking}))}</View>,any('pets','smoking')):form==='bath'?sec('rules',t('Правила'),<View style={f.chips}>{chip('smoking',d.smoking?t('Курение разрешено'):t('Курение запрещено'),d.smoking,()=>patch({smoking:!d.smoking}))}</View>):null;
 // Who cleans after the guests: an executor of the service for a fee, or the place's own people.
 const cleaning=sec('cleaning',form==='rooms'||form==='stay'?t('Уборка'):t('Уборка и персонал'),<>
  <View style={f.chips} accessibilityRole="radiogroup">{chip('service',t('Исполнитель сервиса'),!d.ownStaff,()=>patch({ownStaff:false}),true)}{chip('own',t('Свой персонал'),d.ownStaff,()=>patch({ownStaff:true}),true)}</View>
  {!d.ownStaff?<View style={f.grid}>{num('cleaningFee',t('Уборка после гостя, ₸'),1000000)}</View>:<Text style={f.hint}>{t('Сервис не ищет исполнителей: после гостей готовят ваши люди.')}</Text>}
 </>,guessed('ownStaff'));
 const hours=x.hours?<View key="hours" style={f.sec}><VenueHoursRows kind={d.type} value={x.hours} busy={false} cleaningMinutes={d.cleaningMinutes} onChange={v=>onExtras({hours:v})}/></View>:null;
 const entry=sec('entry',t('Заезд и ключи'),<>
  <View style={f.grid}><View style={f.half}>{text(t('Заезд с'),d.checkinTime,v=>patch({checkinTime:v}),5,'14:00')}</View><View style={f.half}>{text(t('Выезд до'),d.checkoutTime,v=>patch({checkoutTime:v}),5,'12:00')}</View></View>
  <Text style={f.label}>{t('Как гость получит ключи')}</Text>
  <View style={f.chips}>{Object.entries(checkinMethods).filter(([id])=>form==='rooms'||id!=='reception').map(([id,label])=>chip(id,label,d.checkinMethod===id,()=>patch({checkinMethod:id}),true))}</View>
 </>,any('checkinMethod'));

 if(form==='rooms'){const put=(i:number,v:Partial<FormExtras['roomTypes'][number]>)=>onExtras({roomTypes:x.roomTypes.map((r,j)=>j===i?{...r,...v}:r)});
  return <View style={f.list}>
   {sec('rooms',t('Номера'),<>
    <Text style={f.hint}>{t('Одна строка на одинаковые номера. Гость увидит, сколько из них свободно.')}</Text>
    {x.roomTypes.map((r,i)=><View key={i} style={f.item}>
     <View style={f.itemHead}><View style={f.grow}>{text(t('Название номера'),r.name,v=>put(i,{name:v}),60,t('Стандарт, Люкс…'))}</View>{x.roomTypes.length>1&&remove(t('Убрать номер «{v}»',{v:r.name}),()=>onExtras({roomTypes:x.roomTypes.filter((_,j)=>j!==i)}))}</View>
     <View style={f.grid}><View style={f.half}><Stepper label={t('Таких номеров')} value={r.count} text={String(r.count)} min={1} max={MAX_UNITS} onChange={v=>put(i,{count:v})}/></View><View style={f.half}><Stepper label={t('Гостей в номере')} value={r.capacity} text={String(r.capacity)} min={1} max={20} onChange={v=>put(i,{capacity:v})}/></View></View>
     <View style={f.grid}>{money(t('Сутки, ₸'),r.price,v=>put(i,{price:v}))}</View>
    </View>)}
    {x.roomTypes.length<MAX_ROOM_TYPES&&link(t('+ Добавить тип номера'),()=>onExtras({roomTypes:[...x.roomTypes,{name:'',count:1,capacity:2,price:0}]}))}
   </>,any('price','capacity'))}
   {entry}{cleaning}{amenityList}{rules}
  </View>;}

 if(form==='hall'){const put=(i:number,v:Partial<FormExtras['halls'][number]>)=>onExtras({halls:x.halls.map((h,j)=>j===i?{...h,...v}:h)});
  return <View style={f.list}>
   {sec('halls',t('Залы'),<>
    {x.halls.map((h,i)=><View key={i} style={f.item}>
     <View style={f.itemHead}><View style={f.grow}>{text(t('Название зала'),h.name,v=>put(i,{name:v}),60,t('Большой зал'))}</View>{x.halls.length>1&&remove(t('Убрать зал «{v}»',{v:h.name}),()=>onExtras({halls:x.halls.filter((_,j)=>j!==i)}))}</View>
     <Stepper label={t('Вмещает гостей')} value={h.capacity} text={String(h.capacity)} min={1} max={1000} step={10} onChange={v=>{put(i,{capacity:v});if(i===0)patch({capacity:v,beds:Math.max(d.beds,v)});}}/>
    </View>)}
    {x.halls.length<MAX_HALLS&&link(t('+ Добавить зал'),()=>onExtras({halls:[...x.halls,{name:'',capacity:50}]}))}
   </>,any('capacity'))}
   {sec('prices',t('Цена'),<><View style={f.grid}>{num('price',t('На гостя, ₸'),1000000)}{num('leastGuests',t('Минимум гостей'),1000)}</View><View style={f.grid}>{num('deposit',t('Депозит, ₸'))}</View></>,any('price'))}
   {hours}
   {sec('menu',t('Меню'),<TextInput accessibilityLabel={t('Меню')} multiline scrollEnabled={false} style={[f.input,f.area]} value={x.menu} maxLength={1500} placeholder={t('Салаты, бешбармак, горячее, десерт…')} placeholderTextColor={C.muted} onChangeText={v=>onExtras({menu:v})}/>)}
   {amenityList}{cleaning}
  </View>;}

 if(form==='auto'){const list=x.services,put=(i:number,v:Partial<FormExtras['services'][number]>)=>onExtras({services:list.map((s,j)=>j===i?{...s,...v}:s)});
  return <View style={f.list}>
   {sec('bays',t('Боксы'),<>
    <Stepper label={t('Всего боксов')} value={x.units} text={String(x.units)} min={1} max={MAX_UNITS} onChange={v=>onExtras({units:v,bookedBays:Math.min(x.bookedBays,v)})}/>
    <View style={f.chips} accessibilityRole="radiogroup">{chip('staffed',t('С мойщиками'),!x.selfService,()=>onExtras({selfService:false}),true)}{chip('self',t('Самообслуживание'),x.selfService,()=>onExtras({selfService:true}),true)}</View>
    {!x.selfService&&<Stepper label={t('Из них по записи')} value={x.bookedBays} text={x.bookedBays?t('{n} из {total}',{n:x.bookedBays,total:x.units}):t('нет, только очередь')} min={0} max={x.units} onChange={v=>onExtras({bookedBays:v})}/>}
    <Text style={f.hint}>{x.selfService?t('Без записи: гость видит посты и часы работы.'):t('Остальные боксы — живая очередь. Гость видит загрузку.')}</Text>
   </>)}
   {sec('services',t('Услуги'),<>
    {list.map((s,i)=><View key={i} style={f.item}>
     <View style={f.itemHead}><View style={f.grow}>{text(t('Услуга'),s.name,v=>put(i,{name:v}),60,t('Кузов, комплекс…'))}</View>{list.length>1&&remove(t('Убрать услугу «{v}»',{v:s.name}),()=>onExtras({services:list.filter((_,j)=>j!==i)}))}</View>
     <Stepper label={t('Длится')} value={s.minutes} text={minutesText(s.minutes)} min={15} max={720} step={15} onChange={v=>put(i,{minutes:v})}/>
     <View style={f.grid}>{money(t('Цена, ₸'),s.price,v=>put(i,{price:v}),1000000)}</View>
    </View>)}
    {list.length<MAX_SERVICES&&link(t('+ Добавить услугу'),()=>onExtras({services:[...list,{name:'',minutes:30,price:0}]}))}
    <Text style={f.hint}>{t('Цены для кроссоверов и джипов можно задать потом в редакторе.')}</Text>
   </>,!list.length)}
   {hours}{amenityList}
  </View>;}

 if(form==='bath'||form==='hourly'){const many=unitKinds.includes(d.type);
  return <View style={f.list}>
   {many&&sec('units',t(words.title),<Stepper label={t(words.count)} value={x.units} text={String(x.units)} min={1} max={MAX_UNITS} onChange={v=>onExtras({units:v})}/>)}
   {sec('prices',t('Гости и цена'),<>
    {!car&&guests(category==='sport'?t('Игроков'):t('Вмещает гостей'))}
    <View style={f.grid}>{num('hourlyPrice',t('Час, ₸'))}<View style={f.half}><Stepper label={t('Минимум часов')} value={d.minHours} text={t('{n} ч',{n:d.minHours})} min={1} max={24} onChange={v=>patch({minHours:v})}/></View></View>
    {form==='bath'&&<View style={f.grid}>{num('includedGuests',t('Гостей в цене · 0 — все'),50)}{num('extraGuestPrice',t('Доплата за гостя в час, ₸'),1000000)}</View>}
    <View style={f.grid}>{num('deposit',t('Депозит, ₸'))}</View>
   </>,any('capacity','hourlyPrice','minHours'))}
   {hours}
   {heated&&sec('prep',t('Подготовка'),<>
    <Stepper label={t('Затопить заранее')} value={d.prepMinutes||0} text={d.prepMinutes?minutesText(d.prepMinutes):t('не нужно')} min={0} max={360} step={30} onChange={v=>patch({prepMinutes:v})}/>
    <Text style={f.hint}>{t('Напомню затопить вовремя и не приму бронь, если до гостей осталось меньше.')}</Text>
   </>,guessed('prepMinutes'))}
   {amenityList}{rules}{cleaning}
  </View>;}

 // A home: a flat, a studio, a room, a house, a guest house.
 const house=d.type==='house'||d.type==='guesthouse',single=d.type==='room'||d.type==='studio';
 return <View style={f.list}>
  {sec('size',t('Размер'),<>
   <View style={f.grid}>{!single&&<View style={f.half}><Stepper label={t('Комнаты')} value={d.rooms} text={String(d.rooms)} min={1} max={20} onChange={v=>patch({rooms:v})}/></View>}<View style={f.half}>{guests(t('Гостей'))}</View></View>
   <View style={f.grid}>{num('area',t('Площадь, м²'),2000)}{house?num('floors',t('Этажей'),100):<>{num('floor',t('Этаж'),100)}{num('floors',t('Этажей в доме'),100)}</>}</View>
  </>,any('rooms','capacity','area','floor'))}
  {sec('prices',t('Цены'),<>
   <View style={f.grid}>{num('price',t('Сутки, ₸'))}{num('hourlyPrice',t('Час, ₸ · 0 — нет'))}</View>
   <View style={f.grid}>{num('nightlyPrice',t('Ночь, ₸ · 0 — нет'))}{num('deposit',t('Депозит, ₸'))}</View>
   {!!feeLine&&<Text style={f.hint}>{feeLine}</Text>}
  </>,any('price'))}
  {entry}{cleaning}{amenityList}{rules}
 </View>;
}

const f=StyleSheet.create({
 list:{gap:12},
 sec:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,padding:12,gap:12},
 secTitle:{color:C.ink,...type.body,fontWeight:'600'},guess:{color:C.warning,...type.caption,fontWeight:'600'},
 item:{gap:8,paddingTop:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:C.lineStrong},itemHead:{flexDirection:'row',alignItems:'flex-end',gap:12},grow:{flex:1,minWidth:0},
 grid:{flexDirection:'row',gap:8},half:{flex:1},
 tile:{flex:1,minHeight:76,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'space-between'},
 label:{color:C.muted,...type.caption,fontWeight:'600'},value:{color:C.ink,...type.subtitle,fontWeight:'600',padding:0,...(Platform.OS==='web'?({outlineStyle:'none'} as object):null)},
 field:{gap:4},input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 area:{minHeight:96,textAlignVertical:'top',...type.label},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 chipOn:{backgroundColor:C.ink,borderColor:C.ink},chipText:{color:C.ink,...type.label},chipTextOn:{color:C.onAccent,fontWeight:'600'},
 hint:{color:C.muted,...type.caption},
 link:{paddingVertical:8},linkText:{color:C.ink,...type.label,fontWeight:'600',textDecorationLine:'underline'},
 remove:{color:C.danger,...type.label,fontWeight:'600',paddingBottom:12},
});
