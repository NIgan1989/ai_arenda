import {t} from '../../../lib/i18n';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,TextInput,ScrollView,StyleSheet} from 'react-native';
import {request} from '../api';
import {a,RowIcon,type MenuIcon} from '../AccountRows';
import {SheetModal,SheetButton} from '../ChoiceSheet';
import {s,C,type} from '../styles';
import {T} from '../tokens';
import {date as when} from '../model';

// The pieces every page of «Управление сервисом» is made of (board mobbin/admin, 2026-11-26): one line per thing,
// tabs with a count instead of tiles, one big number on a money page, the main step swiped at the bottom.
export type Row=Record<string,any>;
export {when};
export const money=(n:number)=>(n<0?'−':'')+new Intl.NumberFormat('ru-RU').format(Math.abs(Math.round(n||0))).replace(/\s/g,' ')+' ₸';
export const day=(at:number)=>at?new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long'}):'—';
export const span=(sec:number)=>{const m=Math.max(1,Math.round(Math.abs(sec)/60));return m<60?m+' мин':m<1440?Math.round(m/60)+' ч':Math.round(m/1440)+' дн';};
export const percent=(bp:number)=>String((bp||0)/100).replace('.',',')+'%';
export const monthName=(m:string,long=true)=>{const [y,mm]=String(m).split('-').map(Number);if(!y||!mm)return m;return new Date(Date.UTC(y,mm-1,15)).toLocaleDateString('ru-RU',long?{month:'long',year:'numeric',timeZone:'UTC'}:{month:'long',timeZone:'UTC'}).replace(/^./,c=>c.toUpperCase()).replace(' г.','');};
export const roleName:Row={guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'};
export const upper=(v:string)=>String(v||'').replace(/^./,c=>c.toUpperCase());
export const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);

/** GET /api/admin/<path> for a page, and POST for its steps: a step reloads the page and says what the server answered. */
export function useAdmin(path:string|null){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),seq=useRef(0);
 const load=useCallback(async()=>{if(!path)return;const n=++seq.current;setError('');try{const v=await request('/api/admin/'+path);if(n===seq.current)setData(v);}catch(e){if(n===seq.current)setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}},[path]);
 useEffect(()=>{void load();},[load]);
 async function save(route:string,body:Row,reload=true):Promise<Row|undefined>{
  if(busy)return;setBusy(true);setError('');setNote('');
  try{const r=await request('/api/admin/'+route,body);setNote(r?.message||'');if(reload)await load();return r||{};}
  catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));return undefined;}finally{setBusy(false);}
 }
 return {data,error,busy,note,load,save,setNote};
}

/** What the server said after a step, or why it refused. */
export function Said({error,note}:{error?:string;note?:string}){
 return <>{!!error&&<Text accessibilityRole="alert" style={[s.error,k.said]}>{error}</Text>}{!!note&&!error&&<Text accessibilityLiveRegion="polite" style={[a.saved,k.said]}>{note}</Text>}</>;
}
export function Loading({error}:{error?:string}){return error?<Text accessibilityRole="alert" style={[s.error,k.said]}>{error}</Text>:<Text style={[s.meta,k.said]}>{t('Загружаю…')}</Text>;}

/** Tabs with a count, as «Ждут вас 3 · Ведёт ИИ 4 · Решены» (Spotify for Creators, ClickUp). */
export function Tabs<V extends string>({items,value,onChange}:{items:[V,string,number?][];value:V;onChange:(v:V)=>void}){
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={k.tabs} contentContainerStyle={k.tabsIn}>
  {items.map(([id,label,count])=>{const on=id===value;return <Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:on}} onPress={()=>onChange(id)} style={[k.tab,on&&k.tabOn]}><Text style={[k.tabText,on&&k.tabTextOn]}>{label}{count!==undefined?' '+count:''}</Text></Pressable>;})}
 </ScrollView>;
}

/** One line: what, under it who and when, the value on the right; a red dot is urgent or late, a grey one is «not connected». */
export function Line({title,note,value,dot,icon,onPress,label}:{title:string;note?:string;value?:string|number|null;dot?:'red'|'ink'|'grey';icon?:MenuIcon;onPress?:()=>void;label?:string}){
 const shown=value!==undefined&&value!==null&&value!=='';
 const body=<><RowIcon icon={icon}/>{!!dot&&<View style={[k.dot,dot==='red'&&{backgroundColor:C.danger},dot==='grey'&&{backgroundColor:C.lineStrong}]}/>}<View style={shown?{flex:1,minWidth:0}:a.wide}><Text style={a.title}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>{shown&&<Text numberOfLines={1} style={[a.value,{flexGrow:0,flexShrink:1,flexBasis:'auto',maxWidth:'50%'},dot==='red'&&{color:C.danger}]}>{value}</Text>}{!!onPress&&<Text style={a.chevron}>›</Text>}</>;
 return onPress?<Pressable accessibilityRole="button" accessibilityLabel={label||[title,note,value].filter(v=>v!==undefined&&v!==null&&v!=='').join('. ')} onPress={onPress} style={({pressed})=>[a.row,pressed&&a.pressed]}>{body}</Pressable>:<View accessible accessibilityLabel={label||[title,note,value].filter(v=>v!==undefined&&v!==null&&v!=='').join('. ')} style={a.row}>{body}</View>;
}
/** A report line: a total in bold, a part indented under it. */
export function Sum({title,value,part=false,hint}:{title:string;value:number;part?:boolean;hint?:string}){
 return <View accessible accessibilityLabel={title+': '+money(value)} style={[k.sum,part&&k.sumPart]}><View style={{flex:1,minWidth:0}}><Text style={[k.sumText,part&&k.sumPartText]}>{title}</Text>{!!hint&&<Text style={a.note}>{hint}</Text>}</View><Text style={[k.sumText,part&&k.sumPartText,value<0&&{color:C.danger}]}>{money(value)}</Text></View>;
}
export function Big({label,value,note,red=false}:{label:string;value:string;note?:string;red?:boolean}){
 return <View accessible accessibilityLabel={label+': '+value+(note?'. '+note:'')} style={k.big}><Text style={a.note}>{label}</Text><Text style={[k.bigValue,red&&{color:C.danger}]}>{value}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>;
}
/** The one line at the top of the home and of «Состояние сервиса» (Xbox status). */
export function State({ok,title,note}:{ok:boolean;title:string;note?:string}){
 return <View accessible accessibilityLabel={title+(note?'. '+note:'')} style={k.state}><View style={[k.dot,!ok&&{backgroundColor:C.danger}]}/><Text style={[a.title,{flex:1}]}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>;
}
export function Quote({text}:{text:string}){return <Text style={k.quote}>{text}</Text>;}
export function Check({ok,text}:{ok:boolean;text:string}){return <View accessible accessibilityLabel={(ok?t('Пройдено: '):t('Не пройдено: '))+text} style={k.check}><Text style={[k.checkMark,!ok&&{color:C.danger,borderColor:C.danger}]}>{ok?'✓':'!'}</Text><Text style={[k.checkText,!ok&&{color:C.danger,fontWeight:'600'}]}>{text}</Text></View>;}
export function Note({text}:{text:string}){return <Text style={k.note}>{text}</Text>;}
export function Title({title,note}:{title:string;note?:string}){return <View style={k.titleBox}><Text accessibilityRole="header" style={k.title}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>;}
export function Empty({text}:{text:string}){return <Text style={k.empty}>{text}</Text>;}
/** A rare or dangerous step: a line of text, not a button in every row (board, «Отклонить с причиной»). */
export function Link({title,onPress,danger=false,disabled=false}:{title:string;onPress:()=>void;danger?:boolean;disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[k.link,(pressed||disabled)&&{opacity:.5}]}><Text style={[k.linkText,danger&&{color:C.danger}]}>{title}</Text></Pressable>;
}
export function Bottom({children}:{children:React.ReactNode}){return <View style={k.bottom}>{children}</View>;}

/** A sheet with one text: a reason the participant reads, an answer, a statement. */
export function TextSheet({visible,title,note,placeholder,initial='',min=1,button,onClose,onSubmit,busy=false,multiline=true,numeric=false}:{visible:boolean;title:string;note?:string;placeholder?:string;initial?:string;min?:number;button:string;onClose:()=>void;onSubmit:(text:string)=>void;busy?:boolean;multiline?:boolean;numeric?:boolean}){
 const [text,setText]=useState(initial);useEffect(()=>{if(visible)setText(initial);},[visible]); // eslint-disable-line react-hooks/exhaustive-deps
 return <SheetModal visible={visible} title={title} note={note} onClose={onClose}>
  <TextInput accessibilityLabel={title} value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={C.muted} multiline={multiline} keyboardType={numeric?'decimal-pad':'default'} maxLength={2000} style={[s.field,multiline&&{minHeight:96,textAlignVertical:'top'}]}/>
  <SheetButton title={button} disabled={busy||text.trim().length<min} onPress={()=>onSubmit(text.trim())}/>
 </SheetModal>;
}
/** A short form in a sheet: a few fields and one button. */
export type Field={key:string;label:string;numeric?:boolean;placeholder?:string};
export function FormSheet({visible,title,note,fields,initial={},button,busy=false,onClose,onSubmit,extra}:{visible:boolean;title:string;note?:string;fields:Field[];initial?:Row;button:string;busy?:boolean;onClose:()=>void;onSubmit:(v:Row)=>void;extra?:React.ReactNode}){
 const [v,setV]=useState<Row>(initial);useEffect(()=>{if(visible)setV(initial);},[visible]); // eslint-disable-line react-hooks/exhaustive-deps
 return <SheetModal visible={visible} title={title} note={note} onClose={onClose}>
  {fields.map(f=><View key={f.key} style={{marginBottom:8}}><Text style={s.fieldLabel}>{f.label}</Text><TextInput accessibilityLabel={f.label} value={String(v[f.key]??'')} onChangeText={x=>setV({...v,[f.key]:f.numeric?x.replace(/[^\d.,-]/g,''):x})} keyboardType={f.numeric?'decimal-pad':'default'} placeholder={f.placeholder} placeholderTextColor={C.muted} maxLength={200} style={s.field}/></View>)}
  {extra}
  <SheetButton title={button} disabled={busy} onPress={()=>onSubmit(v)}/>
 </SheetModal>;
}
export const today=()=>new Date(Date.now()+5*3600000).toISOString().slice(0,10);

const k=StyleSheet.create({
 said:{marginTop:12},
 tabs:{marginHorizontal:-16,marginTop:4,marginBottom:4,flexGrow:0},tabsIn:{paddingHorizontal:16,gap:8},
 tab:{minHeight:36,paddingHorizontal:14,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,justifyContent:'center',backgroundColor:C.surface},tabOn:{backgroundColor:C.ink,borderColor:C.ink},
 tabText:{...type.label,color:C.ink,fontWeight:'600'},tabTextOn:{color:C.onAccent},
 dot:{width:8,height:8,borderRadius:4,backgroundColor:C.ink,flexShrink:0},
 sum:{flexDirection:'row',alignItems:'center',gap:12,minHeight:44,paddingHorizontal:16,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},sumPart:{paddingLeft:32,minHeight:40},
 sumText:{...type.label,color:C.ink,fontWeight:'700'},sumPartText:{fontWeight:'500',color:C.inkSoft},
 big:{paddingTop:8,paddingBottom:12,gap:2},bigValue:{...type.display,color:C.ink,fontWeight:'800',letterSpacing:-.6},
 state:{flexDirection:'row',alignItems:'center',gap:10,minHeight:52,paddingHorizontal:14,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,marginTop:4},
 quote:{...type.body,color:C.ink,backgroundColor:C.surfaceAlt,borderRadius:T.radius.lg,padding:12,marginTop:8},
 check:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:6},checkMark:{width:20,height:20,borderRadius:10,borderWidth:1.5,borderColor:C.ink,textAlign:'center',lineHeight:17,fontSize:11,fontWeight:'800',color:C.ink,overflow:'hidden'},checkText:{...type.label,color:C.ink,flex:1},
 note:{...type.caption,color:C.muted,marginTop:12,marginHorizontal:4},
 titleBox:{paddingTop:4,paddingBottom:8,gap:2},title:{...type.subtitle,color:C.ink,fontWeight:'800'},
 empty:{...type.label,color:C.muted,paddingVertical:20,textAlign:'center'},
 link:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:8},linkText:{...type.label,color:C.ink,fontWeight:'700'},
 bottom:{marginTop:20,gap:4},
});
