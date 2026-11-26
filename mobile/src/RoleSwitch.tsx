import {t} from '../../lib/i18n';
import {joinTitle} from '../../lib/role-experience';
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AccessibilityInfo,Animated,BackHandler,Easing,Image,Modal,Platform,Pressable,StatusBar,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {Dome} from './BrandMoments';
import {Photo} from './ListingMedia';
import {C,brandFont,type} from './styles';
import {T} from './tokens';
import type {Role} from './model';

// Changing the role without leaving the map: a chip next to the round profile button names the role, a sheet lists
// the roles, and while the new role loads a white plate with the black шаңырақ (the same as the splash, EntrySplash.tsx)
// says which role the person is now in.
const ORDER:Role[]=['guest','owner','cleaner'];
const icons:Record<Role,any>={guest:require('../assets/navigation/catalog.png'),owner:require('../assets/navigation/properties.png'),cleaner:require('../assets/navigation/cleaning.png')};
const name=(role:Role)=>role==='guest'?t('Гость'):role==='owner'?t('Владелец'):t('Исполнитель уборки');
const short=(role:Role)=>role==='cleaner'?t('Исполнитель'):name(role);
const about=(role:Role)=>role==='guest'?t('Поиск жилья, бронирования и проживание'):role==='owner'?t('Жильё, заявки гостей и уборки'):t('Доступные задания, назначения и отчёты');
const native=Platform.OS!=='web';

/** Over the map, in place of the round profile button: the photo opens the profile, the role next to it opens the roles. */
export function MapAccountButton({role,busy,open,avatarId,avatarName,onProfile,onRoles}:{role:Role;busy:boolean;open:boolean;avatarId?:string|null;avatarName?:string;onProfile:()=>void;onRoles:()=>void}){
 return <View style={b.pill}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Меню и профиль')} accessibilityState={{expanded:open,disabled:busy}} disabled={busy} onPress={onProfile} style={b.photo}><Photo id={avatarId} size={36} avatar name={avatarName} alt={t('Профиль')}/></Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Сменить роль')+': '+name(role)} accessibilityState={{disabled:busy}} disabled={busy} onPress={onRoles} hitSlop={{top:6,bottom:6,right:6}} style={({pressed})=>[b.role,pressed&&{opacity:.6}]}>
   <Text numberOfLines={1} style={b.roleText}>{short(role)}</Text><Text style={b.caret}>▾</Text>
  </Pressable>
 </View>;
}

/** The roles as a sheet from below: the connected ones switch at once, the others start the short profile of that role. */
export function RoleSheet({visible,role,roles,onPick,onJoin,onProfile,onClose}:{visible:boolean;role:Role;roles:Role[];onPick:(role:Role)=>void;onJoin:(role:Role)=>void;onProfile:()=>void;onClose:()=>void}){
 const insets=useSafeAreaInsets(),[shown,setShown]=useState(visible),[a]=useState(()=>new Animated.Value(0));
 useEffect(()=>{
  if(visible){setShown(true);Animated.timing(a,{toValue:1,duration:260,easing:Easing.out(Easing.cubic),useNativeDriver:native}).start();}
  else Animated.timing(a,{toValue:0,duration:180,easing:Easing.in(Easing.quad),useNativeDriver:native}).start(({finished})=>{if(finished)setShown(false);});
 },[visible,a]);
 if(!shown)return null;
 const pick=(r:Role)=>{if(r===role){onClose();return;}try{Haptics.selectionAsync().catch(()=>{});}catch{/* no haptics here */}(roles.includes(r)?onPick:onJoin)(r);};
 return <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
  <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:C.scrim,opacity:a}]}><Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} style={StyleSheet.absoluteFill}/></Animated.View>
  <Animated.View accessibilityViewIsModal style={[b.sheet,{paddingBottom:24+insets.bottom,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[420,0]})}]}]}>
   <View style={b.grip}/>
   <Text accessibilityRole="header" style={b.title}>{t('Роль')}</Text>
   {ORDER.map(r=>{const on=r===role,joined=roles.includes(r);return <Pressable key={r} accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={joined?name(r):t(joinTitle(r))} onPress={()=>pick(r)} style={({pressed})=>[b.row,on&&b.rowOn,!joined&&b.rowNew,pressed&&{opacity:.7}]}>
    <View style={[b.icon,on&&{backgroundColor:C.surface}]}><Image source={icons[r]} style={{width:22,height:22,tintColor:on?C.accent:C.inkSoft}}/></View>
    <View style={{flex:1,minWidth:0}}><Text style={b.name}>{name(r)}</Text><Text numberOfLines={2} style={b.note}>{joined?about(r):t(joinTitle(r))+' · '+t('заполнить профиль')}</Text></View>
    <Text style={[b.mark,!on&&{color:C.lineStrong}]}>{on?'✓':joined?'':'›'}</Text>
   </Pressable>;})}
   <Pressable accessibilityRole="button" onPress={onProfile} style={({pressed})=>[b.link,pressed&&{opacity:.6}]}><Text style={b.linkText}>{t('Профиль и настройки')}</Text></Pressable>
  </Animated.View>
 </Modal>;
}

// ── The plate while the role changes (white and monochrome since 2026-11-26, as the splash) ───────────────────────────────────────────────────────────────────
let plate:Role|null=null;const watchers=new Set<()=>void>();
const tell=()=>watchers.forEach(run=>run());
/** Cover the screen with the plate for `role`; `hideRolePlate` lifts it once the role has loaded. */
export function showRolePlate(role:Role){plate=role;tell();}
export function hideRolePlate(){plate=null;tell();}
const subscribe=(run:()=>void)=>{watchers.add(run);return()=>{watchers.delete(run);};},read=()=>plate;
// Long enough to be read, short enough not to be in the way; a slow network keeps the plate until the role is ready.
const MIN_SHOWN=900;

/** Mounted once at the root of the app (App.tsx). */
export function RolePlate(){
 const role=useSyncExternalStore(subscribe,read,read);
 const [shown,setShown]=useState<Role|null>(null),[a]=useState(()=>({plate:new Animated.Value(0),sign:new Animated.Value(0),burst:new Animated.Value(0),words:new Animated.Value(0)}));
 const since=useRef(0),calm=useRef(false);
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined;
  const to=(v:Animated.Value,toValue:number,duration:number,delay=0,easing:(x:number)=>number=Easing.out(Easing.cubic))=>Animated.timing(v,{toValue,duration,delay,easing,useNativeDriver:native});
  if(role){
   setShown(role);since.current=Date.now();[a.plate,a.sign,a.burst,a.words].forEach(v=>v.setValue(0));
   AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(quiet=>{
    if(!alive)return;calm.current=!!quiet;
    if(quiet){a.plate.setValue(1);a.sign.setValue(1);a.words.setValue(1);return;}
    Animated.parallel([to(a.plate,1,200),Animated.spring(a.sign,{toValue:1,friction:6,tension:80,delay:60,useNativeDriver:native}),to(a.burst,1,800,200,Easing.inOut(Easing.quad)),to(a.words,1,360,240)]).start();
   });
  }else if(shown){
   timer=setTimeout(()=>{if(!alive)return;to(a.plate,0,calm.current?120:280,0,Easing.in(Easing.quad)).start(({finished})=>{if(finished&&alive&&!read())setShown(null);});},Math.max(0,MIN_SHOWN-(Date.now()-since.current)));
  }
  return()=>{alive=false;if(timer)clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[role,a]);
 // Back does nothing while the plate is up: the role is changing and there is nothing to go back to yet.
 useEffect(()=>{if(!shown)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>true);return()=>sub.remove();},[shown]);
 if(!shown)return null;
 const up={opacity:a.words,transform:[{translateY:a.words.interpolate({inputRange:[0,1],outputRange:[10,0]})}]};
 // Not a Modal: on iPhone a second Modal cannot open while the roles sheet (itself a Modal) is still closing, and
 // the plate never showed. A layer over the whole app, mounted last at its root, covers everything the same way.
 return <View style={p.layer}>
  {/* Dark signs over the white plate; the root status bar (EntryStatusBar) is back when the plate goes. */}<StatusBar barStyle="dark-content" backgroundColor={C.surface}/>
  <Animated.View accessibilityViewIsModal style={[p.plate,{opacity:a.plate}]}>
   <Animated.View style={{opacity:a.sign,transform:[{scale:a.sign.interpolate({inputRange:[0,1],outputRange:[.7,1]})}]}}><Dome size={150} ink={C.ink} gold={C.ink} burst={a.burst}/></Animated.View>
   <Animated.View style={[p.words,up]}>
    <Text style={p.eyebrow}>{t('ВЫ В РОЛИ')}</Text>
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={p.role}>{name(shown)}</Text>
   </Animated.View>
  </Animated.View>
 </View>;
}

const R=T.radius,H=T.control,shadow={shadowColor:C.ink,shadowOpacity:.12,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:4};
const b=StyleSheet.create({
 pill:{flexDirection:'row',alignItems:'center',height:H.touch,borderRadius:R.full},
 photo:{width:H.touch,height:H.touch,borderRadius:R.full,alignItems:'center',justifyContent:'center'},
 role:{flexDirection:'row',alignItems:'center',gap:4,height:H.touch,paddingLeft:2,paddingRight:12,maxWidth:150},
 roleText:{...type.label,fontWeight:'600',color:C.ink,flexShrink:1},caret:{fontSize:12,color:C.muted,marginTop:1},
 sheet:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:C.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:8,paddingHorizontal:16,...shadow},
 grip:{alignSelf:'center',width:40,height:5,borderRadius:4,backgroundColor:C.lineStrong,marginBottom:12},
 title:{...type.subtitle,fontWeight:'700',color:C.ink,marginBottom:12,marginLeft:4},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:68,padding:12,borderRadius:R.lg,borderWidth:1,borderColor:C.line,marginBottom:8},
 rowOn:{borderWidth:2,borderColor:C.accent,backgroundColor:C.accentSoft},rowNew:{borderStyle:'dashed'},
 icon:{width:40,height:40,borderRadius:12,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},
 name:{...type.body,fontWeight:'600',color:C.ink},note:{...type.caption,color:C.muted,marginTop:2},
 mark:{fontSize:18,fontWeight:'700',color:C.accent,minWidth:16,textAlign:'center'},
 link:{minHeight:H.touch,alignItems:'center',justifyContent:'center',marginTop:4},linkText:{...type.body,fontWeight:'600',color:C.accent},
});
const p=StyleSheet.create({
 layer:{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:1000,elevation:1000},
 plate:{flex:1,backgroundColor:C.surface,alignItems:'center',justifyContent:'center',gap:28,padding:24},
 words:{alignItems:'center',gap:8},
 eyebrow:{...type.caption,letterSpacing:2,fontWeight:'700',color:C.muted},
 role:{...type.heading,...brandFont,color:C.ink,textAlign:'center'},
});
