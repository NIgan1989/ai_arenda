import {t} from '../../lib/i18n';
import React,{useRef,useState,type ReactNode} from 'react';
import {Image,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {DotsIcon} from './ChatIcons';
import {RevealProvider,useKeyboardReveal} from './Keyboard';
import {menuIcons,type MenuIcon} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';

// The editor of a place and each of its steps is one kind of sheet (board «Экраны старой версии», 2026-11-26;
// Turo «Your car», Uber's pin, Airbnb's photo tour): «‹» on the left, the name in the middle, «⋯» and «✕» on the
// right; the content scrolls in rows; the one main button is pinned at the bottom. Black line icons and grey lines,
// colour only on a small dot of state. Everything here is shared by PropertyEdit.tsx and its steps.
export type EditMenuItem={title:string;onPress:()=>void;danger?:boolean;icon?:MenuIcon};
export function EditSheet({title,onBack,onClose,menu,foot,children,busy=false}:{title:string;onBack?:()=>void;onClose:()=>void;menu?:EditMenuItem[];foot?:ReactNode;children:ReactNode;busy?:boolean}){
 const [more,setMore]=useState(false),items=(menu||[]).filter(Boolean);
 // The sheet is its own scrolling page: a field being typed in (and the address suggestions under it) comes above the keyboard.
 const scroll=useRef<ScrollView>(null),y=useRef(0),reveal=useKeyboardReveal(scroll,y);
 // A new step starts a new scroll (the ScrollView is keyed by the title), at its top.
 const shownTitle=useRef(title);if(shownTitle.current!==title){shownTitle.current=title;y.current=0;}
 return <View style={e.sheet}>
  <View style={e.head}>
   <View style={e.grab}/>
   <View style={e.side}>{!!onBack&&<Pressable accessibilityRole="button" accessibilityLabel={t('Назад')} disabled={busy} onPress={onBack} hitSlop={6} style={({pressed})=>[e.round,(pressed||busy)&&e.dim]}><Text style={e.back}>‹</Text></Pressable>}</View>
   <Text accessibilityRole="header" numberOfLines={1} style={e.title}>{title}</Text>
   <View style={[e.side,e.right]}>
    {items.length>0&&<Pressable accessibilityRole="button" accessibilityLabel={t('Ещё')} accessibilityState={{expanded:more}} disabled={busy} onPress={()=>setMore(v=>!v)} hitSlop={4} style={({pressed})=>[e.round,(pressed||busy)&&e.dim]}><DotsIcon color={C.ink} size={20}/></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} disabled={busy} onPress={onClose} hitSlop={4} style={({pressed})=>[e.round,(pressed||busy)&&e.dim]}><Text style={e.close}>✕</Text></Pressable>
   </View>
  </View>
  {/* Each screen starts at its top: the sheet stays mounted between steps, its scroll does not. */}<ScrollView ref={scroll} key={title} onScroll={ev=>{y.current=ev.nativeEvent.contentOffset.y;}} scrollEventThrottle={32} style={e.scroll} contentContainerStyle={e.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"><RevealProvider value={reveal}>{children}</RevealProvider></ScrollView>
  {!!foot&&<View style={e.foot}>{foot}</View>}
  {more&&<><Pressable accessibilityLabel={t('Закрыть меню')} onPress={()=>setMore(false)} style={StyleSheet.absoluteFill}/>
   <View accessibilityViewIsModal style={e.menu}>{items.map((x,i)=><Pressable key={x.title} accessibilityRole="button" onPress={()=>{setMore(false);x.onPress();}} style={({pressed})=>[e.menuRow,i>0&&e.menuLine,pressed&&e.pressed]}>
    {!!x.icon&&<Image source={menuIcons[x.icon]} style={[e.icon,{tintColor:x.danger?C.danger:C.ink}]} accessibilityElementsHidden importantForAccessibility="no"/>}
    <Text style={[e.menuText,x.danger&&e.danger]}>{x.title}</Text>
   </Pressable>)}</View></>}
 </View>;
}

// The main button pinned at the bottom: dark, full width; busy keeps its place and says what is going on.
export function EditButton({title,onPress,disabled=false,busy,line=false}:{title:string;onPress:()=>void;disabled?:boolean;busy?:string|false;line?:boolean}){
 const off=disabled||!!busy;
 return <Pressable accessibilityRole="button" accessibilityLabel={busy||title} accessibilityState={{disabled:off,busy:!!busy}} disabled={off} onPress={onPress} style={({pressed})=>[e.button,line&&e.buttonLine,(off||pressed)&&e.dim]}><Text style={[e.buttonText,line&&e.buttonLineText]}>{busy||title}</Text></Pressable>;
}

// A row of the list: a black line icon, the name, one grey line of what is there, a dot when something is missing, «›».
export function EditRow({icon,title,line,dot,onPress,label,disabled=false,last=false,right}:{icon?:MenuIcon;title:string;line?:string;dot?:string|false;onPress?:()=>void;label?:string;disabled?:boolean;last?:boolean;right?:ReactNode}){
 const body=<>
  {!!icon&&<Image source={menuIcons[icon]} style={e.icon} accessibilityElementsHidden importantForAccessibility="no"/>}
  <View style={e.rowText}><Text numberOfLines={1} style={e.rowTitle}>{title}</Text>{!!line&&<Text numberOfLines={1} style={e.rowLine}>{!!dot&&<Text style={{color:dot}}>● </Text>}{line}</Text>}</View>
  {right}{!!onPress&&!right&&<Image source={menuIcons.chevron} style={e.chevron} accessibilityElementsHidden importantForAccessibility="no"/>}
 </>;
 return onPress?<Pressable accessibilityRole="button" accessibilityLabel={label||[title,line].filter(Boolean).join('. ')} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[e.row,!last&&e.rowLineBottom,(pressed||disabled)&&e.pressed]}>{body}</Pressable>
  :<View accessibilityLabel={label} style={[e.row,!last&&e.rowLineBottom]}>{body}</View>;
}

// A row with a black and white switch at its end.
export function EditSwitch({icon,title,line,value,onChange,disabled=false,last=false,dot}:{icon?:MenuIcon;title:string;line?:string;value:boolean;onChange:(v:boolean)=>void;disabled?:boolean;last?:boolean;dot?:string|false}){
 return <EditRow icon={icon} title={title} line={line} dot={dot} last={last} right={<Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface} {...({activeThumbColor:C.surface} as object)}/>}/>;
}

// A number in a row: the name on the left, the count with «−» and «+» on the right.
export function EditCount({title,line,value,text,min,max,step=1,onChange,disabled=false,last=false}:{title:string;line?:string;value:number;text?:string;min:number;max:number;step?:number;onChange:(v:number)=>void;disabled?:boolean;last?:boolean}){
 const less=disabled||value<=min,more=disabled||value>=max;
 return <EditRow title={title} line={line} last={last} right={<View style={e.count}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('{label}: меньше',{label:title})} disabled={less} onPress={()=>onChange(Math.max(min,value-step))} hitSlop={4} style={[e.countButton,less&&e.dim]}><Text style={e.countSign}>−</Text></Pressable>
  <Text accessibilityLiveRegion="polite" style={e.countValue}>{text??String(value)}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={t('{label}: больше',{label:title})} disabled={more} onPress={()=>onChange(Math.min(max,value+step))} hitSlop={4} style={[e.countButton,more&&e.dim]}><Text style={e.countSign}>+</Text></Pressable>
 </View>}/>;
}

// A number typed in a row: the name on the left, the field on the right with its unit.
export function EditNumber({title,line,value,onChange,max=10000000,unit,placeholder='0',last=false}:{title:string;line?:string;value:number;onChange:(v:number)=>void;max?:number;unit?:string;placeholder?:string;last?:boolean}){
 return <EditRow title={title} line={line} last={last} right={<View style={e.numberBox}><TextInput accessibilityLabel={title} style={e.number} keyboardType="number-pad" value={value?String(value):''} placeholder={placeholder} placeholderTextColor={C.muted} onChangeText={v=>onChange(Math.min(max,Number(v.replace(/[^\d]/g,''))||0))}/>{!!unit&&<Text style={e.unit}>{unit}</Text>}</View>}/>;
}

// A field with its name above: one line or a text box.
export function EditField({label,value,onChange,max=120,placeholder='',multiline=false,keyboard}:{label:string;value:string;onChange:(v:string)=>void;max?:number;placeholder?:string;multiline?:boolean;keyboard?:'default'|'number-pad'|'phone-pad'|'numbers-and-punctuation'}){
 return <View style={e.field}><Text style={e.label}>{label}</Text><TextInput accessibilityLabel={label} style={[e.input,multiline&&e.area]} value={value} maxLength={max} placeholder={placeholder} placeholderTextColor={C.muted} multiline={multiline} keyboardType={keyboard} textAlignVertical={multiline?'top':'center'} onChangeText={onChange}/></View>;
}

// A choice of a few words: the chosen one is black, the others are outlined.
export function EditChips<V extends string|number>({label,value,options,onChange,many=false,disabled=false}:{label?:string;value:V|V[];options:[V,string][];onChange:(v:V)=>void;many?:boolean;disabled?:boolean}){
 const on=(v:V)=>Array.isArray(value)?value.includes(v):value===v;
 return <View style={e.field}>{!!label&&<Text style={e.label}>{label}</Text>}<View accessibilityRole={many?undefined:'radiogroup'} accessibilityLabel={label} style={e.chips}>{options.map(([v,title])=><Pressable key={String(v)} accessibilityRole={many?'checkbox':'radio'} accessibilityState={{checked:on(v),disabled}} disabled={disabled} onPress={()=>onChange(v)} style={({pressed})=>[e.chip,on(v)&&e.chipOn,pressed&&e.dim]}><Text style={[e.chipText,on(v)&&e.chipTextOn]}>{title}</Text></Pressable>)}</View></View>;
}

// A heading over a group of rows, and the one grey line under a step.
export function EditHeading({title}:{title:string}){return <Text accessibilityRole="header" style={e.heading}>{title}</Text>;}
export function EditNote({text,tone}:{text:string;tone?:'error'|'done'}){return <Text accessibilityRole={tone==='error'?'alert':undefined} accessibilityLiveRegion="polite" style={[e.note,tone==='error'&&e.error]}>{text}</Text>;}

// The small dots of state: something is missing, something waits, all is in order.
export const editDot={missing:C.warning,wait:C.warning,ok:C.success,off:C.lineStrong};

const R=T.radius,H=T.control;
export const editStyles=StyleSheet.create({
 sheet:{flex:1,backgroundColor:C.surface},
 head:{minHeight:H.primary,paddingTop:16,paddingBottom:4,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:4},
 grab:{position:'absolute',top:8,left:'50%',marginLeft:-20,width:40,height:4,borderRadius:R.xs,backgroundColor:C.lineStrong},
 side:{width:88,flexDirection:'row',alignItems:'center'},right:{justifyContent:'flex-end'},
 round:{width:H.touch,height:H.touch,borderRadius:R.full,alignItems:'center',justifyContent:'center'},
 back:{fontSize:28,lineHeight:32,color:C.ink,fontWeight:'500'},
 close:{width:32,height:32,borderRadius:R.full,backgroundColor:C.surfaceAlt,color:C.ink,textAlign:'center',lineHeight:32,fontSize:16,overflow:'hidden'},
 title:{...type.body,flex:1,textAlign:'center',color:C.ink,fontWeight:'600'},
 scroll:{flex:1},body:{paddingHorizontal:16,paddingTop:8,paddingBottom:24,gap:12},
 foot:{paddingHorizontal:16,paddingTop:12,paddingBottom:16,gap:8,borderTopWidth:1,borderTopColor:C.line,backgroundColor:C.surface},
 menu:{position:'absolute',top:H.primary,right:12,minWidth:220,borderRadius:R.lg,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,shadowColor:C.ink,shadowOffset:{width:0,height:4},shadowOpacity:.14,shadowRadius:16,elevation:6,overflow:'hidden'},
 menuRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.field,paddingHorizontal:16},menuLine:{borderTopWidth:1,borderTopColor:C.line},
 menuText:{...type.body,color:C.ink},danger:{color:C.danger},
 button:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:24},
 buttonLine:{backgroundColor:C.surface,borderWidth:1,borderColor:C.lineStrong},
 buttonText:{...type.body,color:C.surface,fontWeight:'600',textAlign:'center'},buttonLineText:{color:C.ink},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,paddingVertical:8},rowLineBottom:{borderBottomWidth:1,borderBottomColor:C.line},
 rowText:{flex:1,minWidth:0,gap:2},rowTitle:{...type.body,color:C.ink,fontWeight:'500'},rowLine:{...type.label,color:C.muted},
 icon:{width:24,height:24,tintColor:C.ink},chevron:{width:20,height:20,tintColor:C.muted},
 pressed:{opacity:.6},dim:{opacity:.4},
 count:{flexDirection:'row',alignItems:'center',gap:8},
 countButton:{width:36,height:36,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},
 countSign:{...type.subtitle,color:C.ink},countValue:{...type.body,minWidth:32,textAlign:'center',color:C.ink,fontWeight:'600'},
 numberBox:{flexDirection:'row',alignItems:'center',gap:4,width:128,flexShrink:0,height:H.touch,paddingHorizontal:12,borderRadius:R.md,borderWidth:1,borderColor:C.line},
 number:{flex:1,minWidth:0,...type.body,color:C.ink,fontWeight:'600',textAlign:'right',padding:0},unit:{...type.label,color:C.muted},
 field:{gap:8},label:{...type.label,color:C.ink,fontWeight:'600'},
 input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 area:{minHeight:128},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:H.compact,justifyContent:'center',paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 chipOn:{backgroundColor:C.ink,borderColor:C.ink},chipText:{...type.label,color:C.ink},chipTextOn:{color:C.surface,fontWeight:'600'},
 heading:{...type.label,color:C.muted,fontWeight:'600',marginTop:12},
 note:{...type.label,color:C.muted},error:{color:C.danger},
});
const e=editStyles;
