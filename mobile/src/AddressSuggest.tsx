import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View,type StyleProp,type TextStyle,type ViewStyle} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
type Row=Record<string,any>;

export type AddressKind='city'|'district'|'street';
// A suggestion the owner tapped: a settlement (with its id and centre), a district, a street or a house with its point.
export type AddressPick={kind:AddressKind;value:string;id?:string;district?:string;point?:[number,number];house?:boolean};

const kindName=(kind:string)=>kind==='city'||kind==='town'?t('город'):kind==='hamlet'?t('посёлок'):t('село');
// One line of the list: the name, and under it what tells namesakes apart (region, district, how many houses).
function line(kind:AddressKind,item:Row){
 if(kind==='city')return {title:String(item.name),sub:item.custom?t('Уже есть в сервисе'):[kindName(String(item.kind)),item.raion,item.region].filter(Boolean).join(' · ')};
 if(kind==='district')return {title:String(item.name),sub:''};
 return item.kind==='house'?{title:String(item.label),sub:item.district?t('Район: {district}',{district:item.district}):''}:{title:String(item.label),sub:item.houses?t('Выберите дом в списке или допишите номер'):''};
}
function pickOf(kind:AddressKind,item:Row):AddressPick{
 if(kind==='city')return {kind,value:String(item.name),...(item.id?{id:String(item.id)}:{}),...(item.custom?{}:{point:item.center})};
 if(kind==='district')return {kind,value:String(item.name)};
 return {kind,value:String(item.value),point:item.point,house:item.kind==='house',...(item.district?{district:String(item.district)}:{})};
}

// A field that suggests from the address book of Kazakhstan while the owner types: cities and villages, the districts
// of the chosen city, streets and then houses. Anything can still be typed by hand: a village missing from the map is
// saved as written, and the service puts a known name right when the listing is saved.
export function AddressField({kind,label,value,onChange,onPick,city='',place='',placeholder='',max=120,inputStyle,labelStyle,style}:{kind:AddressKind;label:string;value:string;onChange:(value:string)=>void;onPick?:(pick:AddressPick)=>void;city?:string;place?:string;placeholder?:string;max?:number;inputStyle?:StyleProp<TextStyle>;labelStyle?:StyleProp<TextStyle>;style?:StyleProp<ViewStyle>}){
 const [items,setItems]=useState<Row[]>([]),[focused,setFocused]=useState(false),[typed,setTyped]=useState(false),[asked,setAsked]=useState('');
 const blur=useRef<ReturnType<typeof setTimeout>|null>(null);
 const query=[kind,value,city,place].join('|');
 useEffect(()=>{
  // An empty field shows the largest cities or the districts of the city; a street needs two letters.
  const wants=focused&&(typed||!value.trim())&&(kind==='city'||!!city.trim())&&(kind!=='street'||value.trim().length>=2);
  if(!wants){setItems([]);return;}
  let live=true;
  const timer=setTimeout(async()=>{
   try{const q=new URLSearchParams({kind,q:value.trim(),...(city?{city:city.trim()}:{}),...(place?{place}:{})});const data=await request('/api/public/address?'+q.toString());if(live){setItems(Array.isArray(data?.items)?data.items.slice(0,6):[]);setAsked(query);}}
   catch{if(live){setItems([]);setAsked(query);}}
  },value.trim()?250:0);
  return()=>{live=false;clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[query,focused,typed]);
 useEffect(()=>()=>{if(blur.current)clearTimeout(blur.current);},[]);
 const choose=(item:Row)=>{const pick=pickOf(kind,item);onChange(pick.value);onPick?.(pick);setItems([]);setTyped(false);};
 const nothing=focused&&typed&&kind==='city'&&value.trim().length>=3&&asked===query&&!items.length;
 return <View style={[a.field,style]}>
  <Text style={[a.label,labelStyle]}>{label}</Text>
  <TextInput accessibilityLabel={label} style={[a.input,inputStyle]} value={value} maxLength={max} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize={kind==='street'?'sentences':'words'}
   onFocus={()=>{if(blur.current)clearTimeout(blur.current);setFocused(true);}}
   onBlur={()=>{blur.current=setTimeout(()=>{setFocused(false);setItems([]);},200);}}
   onChangeText={v=>{setTyped(true);onChange(v);}}/>
  {focused&&items.length>0&&<View accessibilityRole="list" style={a.list}>
   {items.map((item,i)=>{const l=line(kind,item);return <Pressable key={i+':'+l.title+':'+(item.id||'')} accessibilityRole="button" accessibilityLabel={[l.title,l.sub].filter(Boolean).join(', ')} onPressIn={()=>{if(blur.current)clearTimeout(blur.current);}} onPress={()=>choose(item)} style={({pressed})=>[a.row,i>0&&a.rowLine,pressed&&a.rowOn]}>
    <Text style={a.icon}>{kind==='street'?(item.kind==='house'?'⌂':'⟶'):'📍'}</Text>
    <View style={a.grow}><Text numberOfLines={1} style={a.title}>{l.title}</Text>{!!l.sub&&<Text numberOfLines={1} style={a.sub}>{l.sub}</Text>}</View>
   </Pressable>;})}
  </View>}
  {nothing&&<Text style={a.hint}>{t('Нет в списке: сохраним, как вы написали')}</Text>}
 </View>;
}

const R=T.radius,H=T.control;
const a=StyleSheet.create({
 field:{gap:4},label:{color:C.muted,...type.caption,fontWeight:'600'},
 input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 list:{marginTop:4,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden',shadowColor:'#0E1324',shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:3},
 row:{flexDirection:'row',alignItems:'center',gap:10,minHeight:H.touch,paddingHorizontal:12,paddingVertical:8},
 rowLine:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:C.line},rowOn:{backgroundColor:C.accentSoft},
 icon:{width:20,textAlign:'center',color:C.accent,...type.body},grow:{flex:1,minWidth:0},
 title:{color:C.ink,...type.body,fontWeight:'600'},sub:{color:C.muted,...type.caption},
 hint:{color:C.muted,...type.caption,marginTop:2},
});
