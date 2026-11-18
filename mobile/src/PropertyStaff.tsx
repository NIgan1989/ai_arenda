// «Сотрудник» of one object: the owner names the person on shift by phone, here and nowhere else. That person sees
// today's guests of the object in «Смена» and marks them; money and settings stay with the owner (lib/staff.ts).
import React,{useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View,Image} from 'react-native';
import {ThinkingLine} from './Thinking';
import {C,type,brandFont} from './styles';
import {T} from './tokens';
import {request} from './api';
import {menuIcons,type MenuIcon} from './AccountRows';
import {isBath} from '../../lib/listings';
type Row=Record<string,any>;
const pretty=(v:string)=>v.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/,'+7 $1 $2 $3 $4');
const since=(at:number)=>'с '+new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long'});

export function PropertyStaff({propertyId,kind,onBack,onChanged}:{propertyId:string;kind?:string;onBack:()=>void;onChanged?:(name:string)=>void}){
 const [state,setState]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[phone,setPhone]=useState('+7'),[confirm,setConfirm]=useState(false);
 useEffect(()=>{let live=true;request('/api/operations/staff/state',{propertyId}).then(v=>{if(live)setState(v);}).catch(x=>{if(live)setError(x?.message||'Не удалось загрузить.');});return()=>{live=false;};},[propertyId]);
 async function run(path:string,body:Row){if(busy)return;setBusy(true);setError('');setNote('');try{const r=await request('/api/operations/staff/'+path,{propertyId,...body});setState(r);setNote(r?.message||'');setConfirm(false);onChanged?.(r?.staff?.name||'');}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 const s=state?.staff,ready=phone.replace(/\D/g,'').length>=11;
 const can:[MenuIcon,string,string][]=[['clock','Видит гостей на сегодня','Время, имя и число гостей. Без телефонов и оплат.'],['check','Отмечает по порядку',(isBath(kind||'')?'Затоплено, гости':'Гости')+' пришли, гости ушли, готово. Вам приходит каждая отметка.'],['lock','Ставит «Занято»','Когда гости пришли с улицы или по звонку: время закрывается для брони.']];
 return <View style={f.sheet}>
  <View style={f.bar}><Pressable accessibilityRole="button" accessibilityLabel="Назад к списку" onPress={onBack} disabled={busy} style={f.round}><Text style={f.roundText}>←</Text></Pressable><Text accessibilityRole="header" style={f.title}>Сотрудник</Text></View>
  {!state&&!error&&<ThinkingLine style={f.hint} text="Загружаю…"/>}
  {s&&<View style={[f.row,f.pinned]}><View style={f.avatar}><Text style={f.avatarText}>{String(s.name||'?').slice(0,1)}</Text></View><View style={{flex:1,minWidth:0}}><Text style={f.name}>{s.name}</Text><Text style={f.line}>{pretty(String(s.phone||''))} · {since(Number(s.since))}</Text></View><Text style={f.badge}>Назначен</Text></View>}
  {state&&!s&&<>
   <Text style={f.hint}>Назначьте того, кто встречает гостей: администратора или банщика. У него должно быть приложение и свой аккаунт.</Text>
   <View style={f.field}><Text style={f.label}>Телефон сотрудника</Text><TextInput accessibilityLabel="Телефон сотрудника" style={f.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} placeholder="+7 777 123 45 67" placeholderTextColor={C.muted}/></View>
   <Pressable accessibilityRole="button" accessibilityLabel="Назначить сотрудника" disabled={busy||!ready} onPress={()=>run('assign',{phone})} style={[f.primary,(busy||!ready)&&f.off]}><Text style={f.primaryText}>{busy?'Назначаю…':'Назначить'}</Text></Pressable>
  </>}
  {state&&<><Text style={f.h}>{s?'ЧТО МОЖЕТ СОТРУДНИК':'ЧТО СМОЖЕТ СОТРУДНИК'}</Text>
   {can.map(([icon,title,text])=><View key={title} style={f.benefit}><View style={f.ico}><Image source={menuIcons[icon]} style={f.icoImg}/></View><View style={{flex:1,minWidth:0}}><Text style={f.name}>{title}</Text><Text style={f.line}>{text}</Text></View></View>)}
   <Text style={f.hint}>Цены, деньги, правила и объявление остаются только у вас.</Text></>}
  {!!note&&<Text accessibilityLiveRegion="polite" style={f.note}>{note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={f.error}>{error}</Text>}
  {s&&(confirm?<View style={f.remove}>
   <Text style={f.text}><Text style={{fontWeight:'700'}}>Снять {s.name}? </Text>Объект пропадёт из его «Смены», отметки снова будут только у вас.</Text>
   <View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>run('remove',{})} style={f.danger}><Text style={f.dangerText}>{busy?'Снимаю…':'Снять'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm(false)} style={f.small}><Text style={f.smallText}>Отмена</Text></Pressable></View>
  </View>:<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm(true)} style={[f.small,{alignSelf:'center'}]}><Text style={f.smallText}>Снять сотрудника</Text></Pressable>)}
 </View>;
}
const R=T.radius,H=T.control;
const f=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 bar:{flexDirection:'row',alignItems:'center',gap:12},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},roundText:{color:C.inkSoft,...type.subtitle},
 title:{color:C.ink,...type.subtitle,...brandFont},
 h:{color:C.muted,...type.caption,fontWeight:'700',marginTop:4},hint:{color:C.muted,...type.caption},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line},pinned:{borderColor:C.accent,backgroundColor:C.accentSoft},
 avatar:{width:40,height:40,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},avatarText:{color:C.onAccent,...type.body,fontWeight:'700'},
 badge:{paddingHorizontal:8,paddingVertical:4,borderRadius:R.full,backgroundColor:C.surface,color:C.accent,...type.caption,fontWeight:'600',overflow:'hidden'},
 name:{color:C.ink,...type.label,fontWeight:'600'},line:{color:C.muted,...type.caption},text:{color:C.ink,...type.label},
 field:{gap:4},label:{color:C.muted,...type.caption,fontWeight:'600'},
 input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',paddingHorizontal:24},off:{backgroundColor:C.lineStrong},primaryText:{color:C.onAccent,...type.body,fontWeight:'700'},
 benefit:{flexDirection:'row',alignItems:'flex-start',gap:12,paddingVertical:4},
 ico:{width:32,height:32,borderRadius:R.full,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},icoImg:{width:16,height:16,tintColor:C.accent},
 small:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:4},smallText:{color:C.muted,...type.label},
 remove:{gap:8,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.danger,backgroundColor:C.dangerSoft},
 danger:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.danger,alignItems:'center',justifyContent:'center',paddingHorizontal:16},dangerText:{color:C.onAccent,...type.label,fontWeight:'700'},
 note:{padding:12,borderRadius:R.md,backgroundColor:C.accentSoft,color:C.ink,...type.label},
 error:{padding:12,borderRadius:R.md,backgroundColor:C.dangerSoft,color:C.danger,...type.label}
});
