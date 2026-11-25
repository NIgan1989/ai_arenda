import {L,t} from '../../lib/i18n';
import React,{useEffect,useRef,useState,type ReactNode} from 'react';
import {ThinkingLine} from './Thinking';
import {Image,KeyboardAvoidingView,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {AddressField} from './AddressSuggest';
import {KeyboardBar,RevealProvider,useKeyboardReveal} from './Keyboard';
import {BRAND_NAME} from '../../lib/brand';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LangSwitch} from './LangSwitch';
import {C,s,type} from './styles';
import {T} from './tokens';
import type {Role,Row} from './model';
// The name of the service as a drawing, like on the site (components/brand.tsx). The image keeps room around the
// name for its glow on the splash, so it is pulled left by that room to stand on the edge of the text under it.
const nameImage=require('../assets/brand/wordmark.png'),NAME=.5;
// The three roles on the first screen: what each gives in a few words (concept of 2026-11-25). Drawn as real apps
// draw this choice (X, Wise on Mobbin): a line icon in a thin circle, the words, a radio; no pastel tiles.
const ROLE_LOOK:Record<Role,{title:string;note:string;icon:any}>={
  guest:{title:/* i18n */'Найти жильё',note:/* i18n */'на часы или сутки, баню, зал',icon:require('../assets/navigation/catalog.png')},
  owner:{title:/* i18n */'Сдавать жильё',note:/* i18n */'ИИ ведёт брони и уборки',icon:require('../assets/menu/key.png')},
  cleaner:{title:/* i18n */'Убирать и зарабатывать',note:/* i18n */'задания рядом с вами',icon:require('../assets/navigation/cleaning.png')},
};
export const roleNames:Record<Role,string>=L({guest:'Гость',owner:'Владелец',cleaner:'Исполнитель уборки'});
export const rolePages:Record<Role,{id:string;title:string;intent:string}[]>=L({
  guest:[{id:'map',title:'Поиск',intent:'workspace'},{id:'overview',title:'Сводка',intent:'workspace'},{id:'catalog',title:'Найти жильё',intent:'properties'},{id:'bookings',title:'Мои брони',intent:'bookings'},{id:'calendar',title:'Календарь',intent:'calendar'},{id:'chats',title:'Чаты',intent:'chats'},{id:'account',title:'Аккаунт',intent:'account'}],
  owner:[{id:'map',title:'Карта',intent:'workspace'},{id:'overview',title:'Сводка',intent:'workspace'},{id:'properties',title:'Мои объекты',intent:'own-properties'},{id:'bookings',title:'Заявки',intent:'owner-bookings'},{id:'cleaning',title:'Уборки',intent:'owner-jobs'},{id:'calendar',title:'Календарь',intent:'calendar'},{id:'chats',title:'Чаты',intent:'chats'},{id:'account',title:'Аккаунт',intent:'account'}],
  cleaner:[{id:'map',title:'Карта',intent:'workspace'},{id:'overview',title:'Сводка',intent:'workspace'},{id:'jobs',title:'Найти задания',intent:'jobs'},{id:'assignments',title:'Мои задания',intent:'my-jobs'},{id:'calendar',title:'Календарь',intent:'calendar'},{id:'chats',title:'Чаты',intent:'chats'},{id:'account',title:'Аккаунт',intent:'account'}],
});
export function intentRole(intent:string):Role|null{
  if(intent.startsWith('book:')||['properties','bookings'].includes(intent))return 'guest';
  if(intent.startsWith('job:')||['property','own-properties','owner-bookings','owner-jobs','job'].includes(intent))return 'owner';
  if(['jobs','my-jobs','cleaner-profile'].includes(intent))return 'cleaner';return null;
}
export function RoleEntry({ready,profile,user,auth,busy,onChoose,onSave,onLogout,notice,banner,start,onStarted,reason,onBack}:{reason?:string;onBack?:()=>void;start?:Role|null;onStarted?:()=>void;banner?:ReactNode;notice?:string;ready:boolean;profile:Row|null;user:Row|null;auth:ReactNode;busy:boolean;onChoose:(role:Role)=>Promise<void>;onSave:(body:Row,role:Role)=>Promise<void>;onLogout:()=>void}){
  const [target,setTarget]=useState<Role|null>(start||null),[values,setValues]=useState<Row>(start?{...profile}:{}),[error,setError]=useState('');
  useEffect(()=>{if(start)onStarted?.();},[]);
  // Sign-in and «Познакомимся» are typed here: the field comes above the keyboard, «Готово» hides it (src/Keyboard.tsx).
  const scroll=useRef<ScrollView>(null),scrollY=useRef(0),reveal=useKeyboardReveal(scroll,scrollY);
  const connected:Role[]=profile?.roles?JSON.parse(profile.roles):[];
  const [picked,setPicked]=useState<Role>(()=>connected[0]||'guest');
  const button=(title:string,onPress:()=>void,secondary=false)=><Pressable accessibilityRole="button" disabled={busy} style={[s.button,secondary&&s.secondary,busy&&s.disabled]} onPress={onPress}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
  const choose=async(role:Role)=>{setError('');if(connected.includes(role)){try{await onChoose(role);}catch(e:any){setError(e.message);}}else{setValues({...profile});setTarget(role);}};
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.shell} behavior="padding">{banner}<ScrollView ref={scroll} onScroll={e=>{scrollY.current=e.nativeEvent.contentOffset.y;}} scrollEventThrottle={32} contentContainerStyle={[s.transcript,{width:'100%',maxWidth:760,alignSelf:'center'}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"><RevealProvider value={reveal}><Image source={nameImage} accessibilityRole="image" accessibilityLabel={BRAND_NAME} accessibilityIgnoresInvertColors style={{width:240*NAME,height:64*NAME,marginLeft:-20*NAME}}/>{!!notice&&<Text accessibilityRole="alert" style={s.error}>{notice}</Text>}{!ready?<ThinkingLine style={s.meta} text={t('Проверяю вход…')}/>:!user?<><View style={{marginTop:20}}><LangSwitch label={t('Язык')}/></View><Text accessibilityRole="header" style={[s.hero,{marginTop:24}]}>{onBack?t('Вход по номеру'):t('Сначала войдите')}</Text><Text style={s.lead}>{reason||t('Для гостей, владельцев жилья и исполнителей уборки.')}</Text>{auth}{!!onBack&&button(t('Назад к карте'),onBack,true)}</>:target?<><Text style={[s.eyebrow,{marginTop:28}]}>{roleNames[target]}</Text><Text accessibilityRole="header" style={s.hero}>{t('Познакомимся')}</Text><View style={s.card}>{[{key:'name',label:t('Имя'),max:100},{key:'contact',label:t('Контакт для связи'),max:120},{key:'city',label:t('Город'),max:80},...(target==='cleaner'?[{key:'districts',label:t('Удобные районы'),max:300},{key:'experience',label:t('Опыт уборки'),max:1000},{key:'availability',label:t('График'),max:300}]:[])].map(f=>f.key==='city'||f.key==='districts'?<AddressField key={f.key} kind={f.key==='city'?'city':'district'} multi={f.key==='districts'} label={f.label} labelStyle={s.fieldLabel} inputStyle={s.field} value={String(values[f.key]||'')} city={String(values.city||'')} place={String(values.cityId||'')} max={f.max} disabled={busy} placeholder={f.key==='districts'?t('Через запятую: Центр, Усольский'):''} onChange={value=>setValues(v=>({...v,[f.key]:value,...(f.key==='city'?{cityId:''}:{})}))} onPick={c=>{if(c.kind==='city')setValues(v=>({...v,cityId:c.id||''}));}}/>:<View key={f.key}><Text style={s.fieldLabel}>{f.label}</Text><TextInput accessibilityLabel={f.label} style={s.field} value={String(values[f.key]||'')} onChangeText={value=>setValues(v=>({...v,[f.key]:value}))} editable={!busy} maxLength={f.max}/></View>)}<Text style={s.meta}>{t('Это профиль участника. Проверка документов пока не подключена.')}</Text>{button(t('Сохранить и открыть страницы'),async()=>{setError('');try{await onSave({...profile,...values,roles:[...new Set([...connected,target])]},target);}catch(e:any){setError(e.message);}})}{button(t('Назад к ролям'),()=>setTarget(null),true)}</View></>:<>{/* As in the concept: one question, three big cards that say what each role gives, then «Продолжить». */}<Text accessibilityRole="header" style={[s.hero,{marginTop:28}]}>{t('Что вы хотите делать?')}</Text><Text style={s.lead}>{t('Можно сменить в любой момент в профиле.')}</Text><View accessibilityRole="radiogroup" style={{gap:12,marginTop:8}}>{(['guest','owner','cleaner'] as Role[]).map(role=>{const on=role===picked,look=ROLE_LOOK[role];return <Pressable key={role} accessibilityRole="radio" accessibilityState={{checked:on,disabled:busy}} accessibilityLabel={(connected.includes(role)?t('Открыть: '):t('Заполнить профиль: '))+roleNames[role]} disabled={busy} onPress={()=>setPicked(role)} style={({pressed})=>[e.card,on&&e.cardOn,(pressed||busy)&&{opacity:.7}]}><View style={e.tile}><Image source={look.icon} style={e.icon}/></View><View style={{flex:1,minWidth:0,gap:2}}><Text style={e.title}>{t(look.title)}</Text><Text style={e.note}>{connected.includes(role)?t(look.note):t(look.note)+' · '+t('нужен профиль')}</Text></View><View style={[e.radio,on&&e.radioOn]}>{on&&<View style={e.radioDot}/>}</View></Pressable>;})}</View><View style={{marginTop:24,gap:8}}>{button(t('Продолжить'),()=>void choose(picked))}<Pressable accessibilityRole="button" disabled={busy} onPress={onLogout} style={e.out}><Text style={e.outText}>{t('Выйти')}</Text></Pressable></View></>}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}</RevealProvider></ScrollView><KeyboardBar/></KeyboardAvoidingView></SafeAreaView>;
}
const e=StyleSheet.create({
  card:{flexDirection:'row',alignItems:'center',gap:12,minHeight:72,paddingHorizontal:16,paddingVertical:12,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
  cardOn:{borderColor:C.ink},
  tile:{width:40,height:40,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},
  icon:{width:20,height:20,tintColor:C.ink},
  title:{...type.body,color:C.ink,fontWeight:'600'},
  note:{...type.label,color:C.muted},
  radio:{width:24,height:24,borderRadius:T.radius.full,borderWidth:2,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},
  radioOn:{borderColor:C.ink,backgroundColor:C.ink},
  radioDot:{width:8,height:8,borderRadius:T.radius.full,backgroundColor:C.surface},
  out:{minHeight:T.control.touch,alignItems:'center',justifyContent:'center'},
  outText:{...type.label,color:C.muted,fontWeight:'600'},
});
