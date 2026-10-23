import React,{useEffect,useState} from 'react';
import {Image,View,Text,Pressable,StyleSheet} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {ImageManipulator,SaveFormat} from 'expo-image-manipulator';
import {request} from './api';
import {C,s} from './styles';
export function Photo({id,avatar=false,alt,size=48}:{id?:string|null;avatar?:boolean;alt:string;size?:number}){
 const [uri,setUri]=useState('');
 useEffect(()=>{let live=true;setUri('');if(id)request('/api/media/'+id).then(r=>{if(live)setUri(r.data);}).catch(()=>{});return()=>{live=false;};},[id]);
 const avatarSize={width:size,height:size,borderRadius:size/2};
 return uri?<Image source={{uri}} accessibilityLabel={alt} style={avatar?[m.avatar,avatarSize]:m.photo} resizeMode="cover" onError={()=>setUri('')}/>:<View accessibilityRole="image" accessibilityLabel={alt} style={avatar?[m.avatarPlaceholder,avatarSize]:m.placeholder}>{avatar?<Image source={require('../assets/navigation/account.png')} style={{width:26,height:26,tintColor:C.green}}/>:<><Image source={require('../assets/navigation/properties.png')} style={{width:28,height:28,tintColor:C.muted}}/><Text style={s.meta}>Фотографии ещё не добавлены</Text></>}</View>;
}
export function PhotoUpload({kind,onAdd,disabled=false,onBusy}:{onBusy?:(v:boolean)=>void;kind:'property'|'avatar';onAdd:(id:string)=>void;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function pick(){setBusy(true);onBusy?.(true);setError('');try{
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1,exif:false});if(result.canceled)return;
  const image=result.assets[0],max=kind==='avatar'?512:1600,context=ImageManipulator.manipulate(image.uri);
  if(image.width>max||image.height>max)context.resize(image.width>=image.height?{width:max}:{height:max});
  const resized=await context.renderAsync();let data='';
  for(const compress of [.82,.68,.5,.35]){const r=await resized.saveAsync({format:SaveFormat.JPEG,compress,base64:true});data='data:image/jpeg;base64,'+r.base64;if(data.length<(kind==='avatar'?105000:475000))break;}
  if(data.length>(kind==='avatar'?105000:475000))throw new Error('Выберите менее крупный снимок.');
  const saved=await request('/api/media',{kind,data});onAdd(saved.id);
 }catch(e:any){setError(e.message||'Не удалось загрузить фото.');}finally{setBusy(false);onBusy?.(false);}}
 return <View><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={pick} style={[s.button,s.secondary,(busy||disabled)&&s.disabled]}><Text style={[s.buttonText,s.secondaryText]}>{busy?'Загружаю…':kind==='avatar'?'Загрузить фото профиля':'Добавить фотографию'}</Text></Pressable>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
export const m=StyleSheet.create({photo:{width:'100%',aspectRatio:1.5,borderRadius:15},placeholder:{width:'100%',aspectRatio:1.5,backgroundColor:'#eeeee7',alignItems:'center',justifyContent:'center',gap:12,borderRadius:15},avatar:{width:48,height:48,borderRadius:24},avatarPlaceholder:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'#e8eee3'},heading:{flexDirection:'row',alignItems:'center',gap:12},badge:{borderRadius:20,paddingHorizontal:10,paddingVertical:7,alignSelf:'flex-start',fontSize:11,color:C.ink,backgroundColor:'#eff1e9',overflow:'hidden'},good:{backgroundColor:'#e8f2e8',color:'#315e48'},warning:{backgroundColor:'#fff3df',color:'#835521'},danger:{backgroundColor:'#fcece8',color:'#994b37'},divider:{height:1,backgroundColor:'#e0e6da',marginVertical:15},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},photoActions:{flexDirection:'row',gap:8,justifyContent:'space-between'},group:{gap:10,marginVertical:14}});
