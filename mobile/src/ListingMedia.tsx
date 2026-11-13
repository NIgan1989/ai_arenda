import React,{useEffect,useState} from 'react';
import {Image,View,Text,Pressable,StyleSheet} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {ImageManipulator,SaveFormat} from 'expo-image-manipulator';
import {request} from './api';
import {C,s} from './styles';
export function Photo({id,avatar=false,alt,size=48,fill=false}:{id?:string|null;avatar?:boolean;alt:string;size?:number;fill?:boolean}){
 // The loaded picture is kept with its id, so a new id shows the placeholder at once and the effect never sets state while it runs.
 const [loaded,setLoaded]=useState<{id:string;uri:string}|null>(null),uri=loaded&&loaded.id===id?loaded.uri:'';
 useEffect(()=>{if(!id)return;let live=true;request('/api/media/'+id).then(r=>{if(live)setLoaded({id,uri:r.data});}).catch(()=>{});return()=>{live=false;};},[id]);
 const avatarSize={width:size,height:size,borderRadius:size/2};
 return uri?<Image source={{uri}} accessibilityLabel={alt} style={avatar?[m.avatar,avatarSize]:fill?m.fill:m.photo} resizeMode="cover" onError={()=>setLoaded(null)}/>:<View accessibilityRole="image" accessibilityLabel={alt} style={avatar?[m.avatarPlaceholder,avatarSize]:fill?[m.placeholder,m.fill]:m.placeholder}>{avatar?<Image source={require('../assets/navigation/account.png')} style={{width:26,height:26,tintColor:C.accent}}/>:<Image source={require('../assets/navigation/properties.png')} style={{width:28,height:28,tintColor:C.accent}}/>}</View>;
}
// Picks photos from the library (several at once when limit>1) or takes one with the camera; empty when cancelled.
export async function pickImages(camera=false,limit=1):Promise<ImagePicker.ImagePickerAsset[]>{
 if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Доступ к камере не разрешён. Можно выбрать готовое фото.');}
 const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:1,exif:false}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1,exif:false,allowsMultipleSelection:limit>1,selectionLimit:Math.max(1,limit),orderedSelection:true});
 return result.canceled?[]:result.assets.slice(0,Math.max(1,limit));
}
// Shrinks one picked photo and saves it; returns the stored photo id.
export async function uploadImage(image:ImagePicker.ImagePickerAsset,kind:'property'|'avatar'):Promise<string>{
 const limit=kind==='avatar'?105000:475000,sides=kind==='avatar'?[512,400,320]:[1600,1280,1024,800,640];let data='';
 // Large phone shots: if the best quality is still too heavy, try a smaller side before giving up.
 for(const side of sides){const context=ImageManipulator.manipulate(image.uri);
  if(image.width>side||image.height>side)context.resize(image.width>=image.height?{width:side}:{height:side});
  const resized=await context.renderAsync();
  for(const compress of [.82,.7,.56,.42]){const r=await resized.saveAsync({format:SaveFormat.JPEG,compress,base64:true});data='data:image/jpeg;base64,'+r.base64;if(data.length<limit)break;}
  if(data.length<limit)break;}
 if(data.length>=limit)throw new Error('Не удалось подготовить фото. Снимите ещё раз или выберите другой снимок.');
 return (await request('/api/media',{kind,data})).id;
}
export function PhotoUpload({kind,onAdd,disabled=false,onBusy}:{onBusy?:(v:boolean)=>void;kind:'property'|'avatar';onAdd:(id:string)=>void;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function pick(camera=false){setBusy(true);onBusy?.(true);setError('');try{
  const [image]=await pickImages(camera,1);if(!image)return;onAdd(await uploadImage(image,kind));
 }catch(e:any){setError(e.message||'Не удалось загрузить фото.');}finally{setBusy(false);onBusy?.(false);}}
 return <View><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={()=>pick(false)} style={[s.button,s.secondary,(busy||disabled)&&s.disabled]}><Text style={[s.buttonText,s.secondaryText]}>{busy?'Загружаю…':kind==='avatar'?'Загрузить фото профиля':'Добавить фотографию'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={()=>pick(true)} style={[s.button,s.secondary,(busy||disabled)&&s.disabled]}><Text style={[s.buttonText,s.secondaryText]}>Снять фото камерой</Text></Pressable>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
export const m=StyleSheet.create({photo:{width:'100%',aspectRatio:1.5,borderRadius:16},fill:{width:'100%',height:'100%',aspectRatio:undefined,borderRadius:0},placeholder:{width:'100%',aspectRatio:1.5,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center',gap:12,borderRadius:16},avatar:{width:48,height:48,borderRadius:24},avatarPlaceholder:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:C.surfaceAlt},heading:{flexDirection:'row',alignItems:'center',gap:12},badge:{borderRadius:8,paddingHorizontal:8,paddingVertical:4,alignSelf:'flex-start',fontSize:12,lineHeight:16,color:C.ink,backgroundColor:C.surfaceAlt,overflow:'hidden'},good:{backgroundColor:C.successSoft,color:C.success},warning:{backgroundColor:C.warningSoft,color:C.warning},danger:{backgroundColor:C.dangerSoft,color:C.danger},divider:{height:1,backgroundColor:C.line,marginVertical:16},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},photoActions:{flexDirection:'row',gap:8,justifyContent:'space-between'},group:{gap:8,marginVertical:12}});
