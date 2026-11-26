import {t} from '../../lib/i18n';
import React from 'react';
import {Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {menuIcons,type MenuIcon} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';

// Where a photo comes from (board «Экраны старой версии», 2026-11-26): one tap on a photo place opens this short list,
// as Thumbtack and Airbnb do, instead of two buttons «Снять фото» / «Из галереи» under every place.
// remove: the photo already there can be taken away from the same list (the profile photo).
export function PhotoSource({visible,title,busy=false,onClose,onCamera,onGallery,onRemove}:{visible:boolean;title?:string;busy?:boolean;onClose:()=>void;onCamera:()=>void;onGallery:()=>void;onRemove?:()=>void}){
 const row=(key:string,label:string,icon:MenuIcon,onPress:()=>void,danger=false)=><Pressable key={key} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress} style={({pressed})=>[p.row,(pressed||busy)&&p.dim]}>
  <Image source={menuIcons[icon]} style={[p.icon,danger&&{tintColor:C.danger}]} accessibilityElementsHidden importantForAccessibility="no"/><Text style={[p.rowText,danger&&{color:C.danger}]}>{label}</Text>
 </Pressable>;
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable accessibilityLabel={t('Закрыть')} onPress={onClose} style={p.shade}/>
  <View style={p.sheet} accessibilityViewIsModal>
   <View style={p.grab}/>
   {!!title&&<Text accessibilityRole="header" style={p.title}>{title}</Text>}
   <View>{row('camera',t('Снять фото'),'camera',onCamera)}{row('gallery',t('Выбрать из галереи'),'file',onGallery)}{!!onRemove&&row('remove',t('Убрать фото'),'trash',onRemove,true)}</View>
  </View>
 </Modal>;
}

const p=StyleSheet.create({
 shade:{flex:1,backgroundColor:C.scrim},
 sheet:{paddingHorizontal:20,paddingTop:8,paddingBottom:32,gap:4,borderTopLeftRadius:T.radius.xl,borderTopRightRadius:T.radius.xl,backgroundColor:C.surface},
 grab:{alignSelf:'center',width:40,height:4,borderRadius:T.radius.full,backgroundColor:C.lineStrong,marginBottom:12},
 title:{...type.subtitle,color:C.ink,fontWeight:'600',marginBottom:4},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,borderTopWidth:1,borderTopColor:C.line},
 icon:{width:22,height:22,tintColor:C.ink},
 rowText:{...type.body,color:C.ink,flex:1},
 dim:{opacity:.6},
});
