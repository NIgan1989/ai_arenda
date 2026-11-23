import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View,type StyleProp,type TextStyle,type ViewStyle} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {useReveal} from './Keyboard';
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

// Districts of a cleaner are a list «Центр, Усольский»: only the last part is being typed and looked up.
const parts=(value:string)=>value.split(',').map(x=>x.trim());
const lastPart=(value:string)=>parts(value).at(-1)||'';
function withPart(value:string,pick:string){const i=value.lastIndexOf(',');return (i<0?'':value.slice(0,i+1)+' ')+pick;}

// Suggestions from the address book while someone types. Used by the field below and by the answer line of the chat.
export function useAddressSuggest({kind,value,city='',place='',active,typed,multi=false,limit=6}:{kind:AddressKind;value:string;city?:string;place?:string;active:boolean;typed:boolean;multi?:boolean;limit?:number}){
 const [items,setItems]=useState<Row[]>([]),[asked,setAsked]=useState('');
 const part=multi?lastPart(value):value.trim(),taken=multi?new Set(parts(value).slice(0,-1).map(x=>x.toLowerCase())):null;
 const query=[kind,part,city,place].join('|');
 useEffect(()=>{
  // An empty field shows the largest cities or the districts of the city; a street needs two letters.
  const wants=active&&(typed||!part)&&(kind==='city'||!!city.trim())&&(kind!=='street'||part.length>=2);
  if(!wants){setItems([]);return;}
  let live=true;
  const timer=setTimeout(async()=>{
   try{const q=new URLSearchParams({kind,q:part,...(city?{city:city.trim()}:{}),...(place?{place}:{})});const data=await request('/api/public/address?'+q.toString());if(live){setItems(Array.isArray(data?.items)?data.items.filter((x:Row)=>!taken?.has(String(x.name||x.value||'').toLowerCase())).slice(0,limit):[]);setAsked(query);}}
   catch{if(live){setItems([]);setAsked(query);}}
  },part?250:0);
  return()=>{live=false;clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[query,active,typed]);
 const nothing=active&&typed&&kind==='city'&&part.length>=3&&asked===query&&!items.length;
 return {items,nothing,clear:()=>setItems([]),value:(item:Row)=>{const pick=pickOf(kind,item);return {pick,text:multi?withPart(value,pick.value):pick.value};}};
}

// The list of suggestions: a tap puts the name in. onLayout lets the page bring the whole list above the keyboard.
export function SuggestList({kind,items,onChoose,onPressIn,onLayout,style}:{kind:AddressKind;items:Row[];onChoose:(item:Row)=>void;onPressIn?:()=>void;onLayout?:()=>void;style?:StyleProp<ViewStyle>}){
 if(!items.length)return null;
 return <View accessibilityRole="list" style={[a.list,style]} onLayout={onLayout}>
  {items.map((item,i)=>{const l=line(kind,item);return <Pressable key={i+':'+l.title+':'+(item.id||'')} accessibilityRole="button" accessibilityLabel={[l.title,l.sub].filter(Boolean).join(', ')} onPressIn={onPressIn} onPress={()=>onChoose(item)} style={({pressed})=>[a.row,i>0&&a.rowLine,pressed&&a.rowOn]}>
   <Text style={a.icon}>{kind==='street'?(item.kind==='house'?'⌂':'⟶'):'📍'}</Text>
   <View style={a.grow}><Text numberOfLines={1} style={a.title}>{l.title}</Text>{!!l.sub&&<Text numberOfLines={1} style={a.sub}>{l.sub}</Text>}</View>
  </Pressable>;})}
 </View>;
}

// A field that suggests from the address book of Kazakhstan while the owner types: cities and villages, the districts
// of the chosen city, streets and then houses. Anything can still be typed by hand: a village missing from the map is
// saved as written, and the service puts a known name right when the listing is saved.
// multi: a list of districts separated by commas (where a cleaner works); each part is suggested in turn.
export function AddressField({kind,label,value,onChange,onPick,city='',place='',placeholder='',max=120,multi=false,disabled=false,inputStyle,labelStyle,style}:{kind:AddressKind;label:string;value:string;onChange:(value:string)=>void;onPick?:(pick:AddressPick)=>void;city?:string;place?:string;placeholder?:string;max?:number;multi?:boolean;disabled?:boolean;inputStyle?:StyleProp<TextStyle>;labelStyle?:StyleProp<TextStyle>;style?:StyleProp<ViewStyle>}){
 const [focused,setFocused]=useState(false),[typed,setTyped]=useState(false);
 const blur=useRef<ReturnType<typeof setTimeout>|null>(null),input=useRef<TextInput>(null),box=useRef<View>(null),reveal=useReveal();
 const {items,nothing,clear,value:chosen}=useAddressSuggest({kind,value,city,place,active:focused&&!disabled,typed,multi});
 useEffect(()=>()=>{if(blur.current)clearTimeout(blur.current);},[]);
 const choose=(item:Row)=>{const {pick,text}=chosen(item);onChange(text.slice(0,max));onPick?.(pick);clear();setTyped(false);if(multi)input.current?.focus();};
 return <View ref={box} style={[a.field,style]}>
  <Text style={[a.label,labelStyle]}>{label}</Text>
  <TextInput ref={input} accessibilityLabel={label} style={[a.input,inputStyle]} value={value} maxLength={max} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} autoCapitalize={kind==='street'?'sentences':'words'} editable={!disabled} returnKeyType="done"
   onFocus={()=>{if(blur.current)clearTimeout(blur.current);setFocused(true);}}
   onBlur={()=>{blur.current=setTimeout(()=>{setFocused(false);clear();},200);}}
   onChangeText={v=>{setTyped(true);onChange(v);}}/>
  {focused&&<SuggestList kind={kind} items={items} onChoose={choose} onPressIn={()=>{if(blur.current)clearTimeout(blur.current);}} onLayout={()=>reveal?.(box.current)}/>}
  {nothing&&<Text style={a.hint}>{t('Нет в списке: сохраним, как вы написали')}</Text>}
 </View>;
}

// Over the answer line of the chat, when the assistant asks for a city or districts: a tap puts the name in the answer.
export function AnswerSuggest({kind,value,city='',multi=false,onChoose}:{kind:AddressKind;value:string;city?:string;multi?:boolean;onChoose:(text:string)=>void}){
 const {items,value:chosen}=useAddressSuggest({kind,value,city,active:true,typed:true,multi,limit:4});
 return <SuggestList kind={kind} items={items} onChoose={item=>onChoose(chosen(item).text)} style={a.answer}/>;
}

const R=T.radius,H=T.control;
const a=StyleSheet.create({
 field:{gap:4},label:{color:C.muted,...type.caption,fontWeight:'600'},
 input:{minHeight:H.field,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,color:C.ink,...type.body},
 list:{marginTop:4,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden',shadowColor:C.ink,shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:3},
 row:{flexDirection:'row',alignItems:'center',gap:8,minHeight:H.touch,paddingHorizontal:12,paddingVertical:8},
 rowLine:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:C.line},rowOn:{backgroundColor:C.accentSoft},
 icon:{width:20,textAlign:'center',color:C.accent,...type.body},grow:{flex:1,minWidth:0},
 title:{color:C.ink,...type.body,fontWeight:'600'},sub:{color:C.muted,...type.caption},
 hint:{color:C.muted,...type.caption,marginTop:2},answer:{marginTop:0},
});
