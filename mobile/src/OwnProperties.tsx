import {forms,t} from '../../lib/i18n';
// «Моё жильё»: the owner's objects as short cards, opened from the «Жильё» shortcut of the home sheet.
// A card says what it is, its state, its price and what is happening there now; a tap opens the facts and
// the actions. Changing an object is the step editor (PropertyEdit), adding one is the AI form (PropertyQuick).
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {BrandEmpty} from './BrandMoments';
import {T} from './tokens';
import {money,type Row} from './model';
import {Photo} from './ListingMedia';
import {RecordFacts,RecordActions,type RecordAction} from './RecordCard';
import {propertyTypes,isBath,isBanquet,isVenue} from '../../lib/listings';
import {processStatus} from '../../lib/process-status';
import {clock} from '../../lib/rental-policy';
import {placeNow} from './own-place';
import {BusyMark,busyNow,hhmm} from './BusyMark';
import {isHome} from '../../lib/home-cleaning';
import {KindIcon} from './KindIcon';

const tones:Record<string,[string,string]>={success:[C.successSoft,C.success],warning:[C.warningSoft,C.warning],active:[C.accentSoft,C.accentPressed],neutral:[C.surfaceAlt,C.muted],danger:[C.dangerSoft,C.danger]};

type Props={properties:Row[];bookings:Row[];busy:boolean;onAdd?:()=>void;onHome?:()=>void;onEdit:(id:string)=>void;onSettings:(id:string)=>void;onCleaning:(id:string)=>void;onMap:(id:string)=>(()=>void)|undefined;onResend?:(p:Row)=>Promise<unknown>};

export function OwnProperties({properties,bookings,busy,onAdd,onHome,onEdit,onSettings,onCleaning,onMap,onResend}:Props){
 const [open,setOpen]=useState(properties.length===1?properties[0].id:'');
 return <View style={o.list}>
  {!!onAdd&&<Pressable accessibilityRole="button" accessibilityLabel={t('Добавить объект')} disabled={busy} onPress={onAdd} style={({pressed})=>[o.add,(pressed||busy)&&o.dim]}>
   <View style={o.addOrb}><Text style={o.addPlus}>+</Text></View>
   <View style={o.grow}><Text style={o.addTitle}>{t('Добавить объект')}</Text><Text style={o.addSub}>{t('Жильё, баня или зал: расскажите одним сообщением, ИИ заполнит объявление')}</Text></View>
  </Pressable>}
  {/* Своё жильё, которое не сдаётся: только уборка (lib/home-cleaning.ts). Без объявления, цены и правил. */}
  {!!onHome&&<Pressable accessibilityRole="button" accessibilityLabel={t('Мой дом: только уборка. Найти исполнителя на уборку своего жилья, которое вы не сдаёте')} disabled={busy} onPress={onHome} style={({pressed})=>[o.add,o.home,(pressed||busy)&&o.dim]}>
   <View style={[o.addOrb,o.homeOrb]}><KindIcon id="cleaning" size={22} color={C.accent}/></View>
   <View style={o.grow}><Text style={o.addTitle}>{t('Мой дом: только уборка')}</Text><Text style={o.addSub}>{t('Не сдаёте? Укажите адрес и свою цену, ИИ найдёт исполнителя')}</Text></View>
  </Pressable>}
  {!properties.length&&<BrandEmpty title={t('Пока пусто')} text={t('Здесь появятся ваши объекты: их состояние, брони и цена.')}/>}
  {properties.map(p=>isHome(p.details?.type)?<HomeCard key={p.id} place={p} busy={busy} onCleaning={()=>onCleaning(p.id)} onMap={onMap(p.id)}/>:<PropertyCard key={p.id} property={p} bookings={bookings} busy={busy} open={open===p.id} onToggle={()=>setOpen((v:string)=>v===p.id?'':p.id)} onEdit={()=>onEdit(p.id)} onSettings={()=>onSettings(p.id)} onCleaning={()=>onCleaning(p.id)} onMap={onMap(p.id)} onResend={onResend&&(()=>onResend(p))}/>)}
 </View>;
}

// A private home that is only cleaned (lib/home-cleaning.ts): nothing to rent, so no listing, price or rules. One thing to do.
function HomeCard({place:p,busy,onCleaning,onMap}:{place:Row;busy:boolean;onCleaning:()=>void;onMap?:()=>void}){
 return <View style={o.card}>
  <View style={o.row}>
   <View style={[o.thumb,o.homeThumb]}><KindIcon id="cleaning" size={28} color={C.accent}/></View>
   <View style={o.grow}>
    <Text numberOfLines={1} style={o.title}>{p.title}</Text>
    <Text numberOfLines={1} style={o.meta}>{[p.city,p.address].filter(Boolean).join(', ')}</Text>
    <View style={o.tags}><Text style={[o.status,{backgroundColor:C.surfaceAlt,color:C.muted}]}>{t('Мой дом · не сдаётся')}</Text></View>
   </View>
  </View>
  <Text style={o.note}>{t('Адрес видите только вы и назначенный исполнитель.')}</Text>
  <RecordActions busy={busy} actions={[{title:t('Заказать уборку'),kind:'main',onPress:onCleaning},!!onMap&&{title:t('На карте'),kind:'side',onPress:onMap}]}/>
 </View>;
}

function PropertyCard({property:p,bookings,busy,open,onToggle,onEdit,onSettings,onCleaning,onMap,onResend}:{property:Row;bookings:Row[];busy:boolean;open:boolean;onToggle:()=>void;onEdit:()=>void;onSettings:()=>void;onCleaning:()=>void;onMap?:()=>void;onResend?:()=>Promise<unknown>}){
 const d=p.details||{},policy=p.policy||{},found=processStatus('property',p,'owner',''),status=isVenue((p.details||{}).type)?{...found,label:found.label.replace('к заселению','к приёму гостей')}:found,[bg,ink]=tones[status.tone]||tones.neutral,hall=isBanquet(d.type),bath=isBath(d.type),now=placeNow(p.id,bookings,undefined,bath||hall);
 const perGuest=hall?Number(policy.extra_guest_price)||0:0,least=Number(policy.included_guests)||1;
 const kind=propertyTypes[d.type]||t('Жильё');
 // «Занято»: guests who came without the service. The card keeps the mark it was given until the state is read again.
 const [marked,setMarked]=useState<Row[]|null>(null),[busyOpen,setBusyOpen]=useState(false),[busyNote,setBusyNote]=useState('');
 // A refused check of the current address (publication audit 2026-11-22): its reason and «Отправить на проверку снова» stay on
 // the card, since the server does not resend a refused address by itself. A flat without a point on the map is not shown to guests.
 const refused=p.review_refused!=null,unmapped=p.mapped===false&&!p.demo_owner,[resent,setResent]=useState('');
 const resend=async()=>{if(!onResend)return;try{const r=await onResend() as Row|undefined;setResent(r?.message?String(r.message):t('Отправлено на проверку. Мы напишем, когда администратор посмотрит.'));}catch(r:any){setResent(r?.message||t('Не получилось отправить. Попробуйте ещё раз.'));}};
 // A fresh state of the object wins over the local mark: the person on shift may have marked or freed it meanwhile.
 useEffect(()=>{setMarked(null);},[p.busy_until]);
 const blocks=marked??(Number(p.busy_until)>Date.now()/1000?[{start:0,end:Number(p.busy_until)}]:[]),held=busyNow(blocks);
 const actions:(RecordAction|false)[]=[
  refused&&!!onResend&&!resent&&{title:t('Отправить на проверку снова'),kind:'main',onPress:()=>{void resend();}},
  {title:t('Изменить'),kind:refused&&!!onResend&&!resent?'side':'main',onPress:onEdit},
  !Number(p.own_staff)&&{title:t('Уборка'),kind:'side',onPress:onCleaning},
  {title:t('Правила'),kind:'side',onPress:onSettings},
  !!onMap&&{title:t('На карте'),kind:'side',onPress:onMap},
  !now.busy&&{title:t('Занято'),kind:'side',onPress:()=>{setBusyNote('');setBusyOpen(v=>!v);}},
 ];
 return <View style={[o.card,open&&o.cardOpen]}>
  <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} accessibilityLabel={[p.title,status.label,now.line,open?t('Свернуть'):t('Подробнее')].join('. ')} onPress={onToggle} style={({pressed})=>[o.row,pressed&&o.dim]}>
   <View style={o.thumb}><Photo id={p.photos?.[0]} alt={p.title} fill/></View>
   <View style={o.grow}>
    <Text numberOfLines={1} style={o.title}>{p.title}</Text>
    <Text numberOfLines={1} style={o.meta}>{p.venue&&p.venue.title!==p.title?p.venue.title:kind} · {hall?(perGuest?t('{v} за гостя',{v:money(perGuest)}):t('цена не задана')):bath&&policy.hourly_price?t('{v} / час',{v:money(policy.hourly_price)}):t('{v} / сутки',{v:money(p.price)})}</Text>
    <View style={o.tags}><Text style={[o.status,{backgroundColor:bg,color:ink}]}>{status.label}</Text>{!!p.address_check&&<Text style={[o.status,{backgroundColor:C.warningSoft,color:C.warning}]}>{t('Адрес на проверке')}</Text>}{refused&&<Text style={[o.status,{backgroundColor:C.dangerSoft,color:C.danger}]}>{t('Проверка не пройдена')}</Text>}{unmapped&&<Text style={[o.status,{backgroundColor:C.warningSoft,color:C.warning}]}>{t('Поставьте адрес на карту')}</Text>}{!!held&&<Text style={[o.status,{backgroundColor:C.warningSoft,color:C.warning}]}>{t('Занято до {time}',{time:hhmm(Number(held.end))})}</Text>}{!!p.demo_owner&&<Text style={[o.status,{backgroundColor:C.surfaceAlt,color:C.muted}]}>{t('Учебный')}</Text>}{!!p.published&&!p.demo_owner&&<Text accessibilityLabel={t('Гости видели карточку в поиске: {v}',{v:shownWords(Number(p.views_week)||0).toLowerCase()})} style={[o.status,{backgroundColor:C.surfaceAlt,color:C.inkSoft}]}>{shownWords(Number(p.views_week)||0)}</Text>}</View>
   </View>
   <Text style={[o.chevron,open&&o.chevronOpen]}>›</Text>
  </Pressable>
  <View style={o.nowRow}><View style={[o.dot,{backgroundColor:now.busy?C.accent:status.tone==='success'?C.success:C.muted}]}/><Text numberOfLines={1} style={o.now}>{now.requests?t('{line} · заявок: {n}',{line:now.line,n:now.requests}):now.line}</Text></View>
  {open&&<>
   <RecordFacts rows={[
    [t('Адрес'),[p.city,p.district,p.address].filter(Boolean).join(', ')],
    [t('Гостей'),[bath||hall?t('до {n}',{n:p.capacity||1}):t('{n} · {rooms} комн.',{n:p.capacity||1,rooms:p.rooms||1}),d.area?t('{area} м²',{area:d.area}):''].filter(Boolean).join(' · ')],
    [t('Цена'),hall?(perGuest?t('{v} за гостя · от {least} гост.',{v:money(perGuest),least}):t('не задана')):bath&&policy.hourly_price?[t('{v} / ч',{v:money(policy.hourly_price)}),policy.min_hours?t('от {minHours} ч',{minHours:policy.min_hours}):''].filter(Boolean).join(' · '):[t('{v} / сутки',{v:money(p.price)}),policy.hourly_price?t('{v} / ч',{v:money(policy.hourly_price)}):''].filter(Boolean).join(' · ')],
    hall&&[t('Время'),t('обед 12:00–17:00 · вечер 18:00–00:00')],
    !bath&&!hall&&[t('Заезд'),t('{v} · выезд {v2}',{v:clock(policy.checkin_minutes??840),v2:clock(policy.checkout_minutes??720)})],
    [t('Фото'),p.photos?.length?String(p.photos.length):t('нет, добавьте, чтобы показать гостям')],
    p.rating?.count>0&&[t('Оценка'),'★ '+String(p.rating.average).replace('.',',')+' ('+p.rating.count+')'],
   ]}/>
   {refused&&<Text style={o.note}>{p.review_refused?t('Администратор не одобрил: {why}',{why:String(p.review_refused)}):t('Администратор не одобрил объявление.')} {t('Исправьте и отправьте на проверку снова.')}</Text>}
   {!!resent&&<Text accessibilityLiveRegion="polite" style={o.note}>{resent}</Text>}
   <RecordActions busy={busy} actions={actions}/>
   {busyOpen&&!now.busy&&<BusyMark propertyId={p.id} busy={blocks} onChange={(next,message)=>{setMarked(next);setBusyNote(message);}}/>}
   {!!busyNote&&!held&&<Text accessibilityLiveRegion="polite" style={o.note}>{busyNote}</Text>}
  </>}
 </View>;
}

// How often guests were shown the card in the search in the last seven days (lib/property-views.ts).
export const shownWords=(n:number)=>n>0?t(forms(n,'{n} показ за неделю','{n} показа за неделю','{n} показов за неделю'),{n}):t('Нет показов за неделю');

const R=T.radius,H=T.control;
const o=StyleSheet.create({
 list:{gap:12,marginTop:4},grow:{flex:1,minWidth:0,gap:4},dim:{opacity:.55},
 add:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.primary,padding:12,borderRadius:R.xl,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.glassLine},
 addOrb:{width:40,height:40,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},addPlus:{...type.title,color:C.onAccent,fontWeight:'600',marginTop:-2},
 addTitle:{...type.body,color:C.accentPressed,fontWeight:'700'},addSub:{...type.caption,color:C.inkSoft},
 empty:{...type.label,color:C.muted,textAlign:'center',paddingVertical:16},note:{...type.caption,color:C.inkSoft,paddingHorizontal:4},
 card:{gap:12,padding:12,borderRadius:R.xl,borderWidth:1,borderColor:C.glassLine,backgroundColor:C.glassStrong},cardOpen:{borderColor:C.accentSoft},
 row:{flexDirection:'row',alignItems:'center',gap:12},
 home:{backgroundColor:C.glassStrong},homeOrb:{backgroundColor:C.accentSoft},
 homeThumb:{alignItems:'center',justifyContent:'center',backgroundColor:C.accentSoft},
 thumb:{width:72,height:72,borderRadius:R.lg,overflow:'hidden',backgroundColor:C.surfaceAlt},
 title:{...type.body,color:C.ink,fontWeight:'700'},meta:{...type.label,color:C.inkSoft},
 tags:{flexDirection:'row',flexWrap:'wrap',gap:8},status:{...type.caption,fontWeight:'500',paddingHorizontal:8,paddingVertical:2,borderRadius:R.sm,overflow:'hidden'},
 chevron:{...type.title,color:C.muted,paddingHorizontal:4},chevronOpen:{transform:[{rotate:'90deg'}]},
 nowRow:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:4},dot:{width:8,height:8,borderRadius:R.full},now:{...type.label,color:C.inkSoft,flex:1},
});
