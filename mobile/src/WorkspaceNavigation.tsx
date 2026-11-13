import React from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {Photo} from './ListingMedia';
import {C} from './styles';
import {T} from './tokens';
const icons:Record<string,any>={chats:require('../assets/navigation/assistant.png'),map:require('../assets/navigation/map.png'),overview:require('../assets/navigation/overview.png'),catalog:require('../assets/navigation/catalog.png'),properties:require('../assets/navigation/properties.png'),bookings:require('../assets/navigation/bookings.png'),cleaning:require('../assets/navigation/cleaning.png'),jobs:require('../assets/navigation/jobs.png'),assignments:require('../assets/navigation/assignments.png'),calendar:require('../assets/navigation/calendar.png'),assistant:require('../assets/navigation/assistant.png'),settings:require('../assets/navigation/settings.png'),account:require('../assets/navigation/account.png'),more:require('../assets/navigation/more.png'),close:require('../assets/navigation/close.png')};
// avatar: the round profile button over the map. It opens the same menu, which starts with the profile.
export function WorkspaceMenuButton({open,busy,onPress,avatar=false,avatarId}:{open:boolean;busy:boolean;onPress:()=>void;avatar?:boolean;avatarId?:string|null}){
 return <Pressable accessibilityRole="button" accessibilityLabel={avatar?'Меню и профиль':'Ещё разделы'} accessibilityState={{expanded:open,disabled:busy}} disabled={busy} onPress={onPress} style={avatar?n.menuAvatar:n.menu}>{avatar?<Photo id={avatarId} size={36} avatar alt="Профиль"/>:<Image source={icons.more} style={[n.icon,{tintColor:C.ink}]}/>}</Pressable>;
}
// The app has no bottom bar: the map is its only screen. The person's round button opens the menu, this one the chats.
export function MapChatsButton({busy,onPress,unread=0}:{busy:boolean;onPress:()=>void;unread?:number}){
 return <Pressable accessibilityRole="button" accessibilityLabel={unread?'Чаты, непрочитанных: '+unread:'Чаты'} accessibilityState={{disabled:busy}} disabled={busy} onPress={onPress} style={n.menuAvatar}><Image source={icons.chats} style={[n.icon,{tintColor:C.ink}]}/>{unread>0&&<View style={n.unread}><Text style={n.unreadText}>{unread>99?'99+':unread}</Text></View>}</Pressable>;
}
const n=StyleSheet.create({
 unread:{position:'absolute',top:-2,right:-2,minWidth:20,height:20,borderRadius:T.radius.full,paddingHorizontal:4,backgroundColor:C.danger,alignItems:'center',justifyContent:'center'},unreadText:{fontSize:T.font.caption[0],lineHeight:T.font.caption[1],fontWeight:'700',color:C.onAccent},
 menu:{width:T.control.field,height:T.control.field,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center'},menuAvatar:{width:T.control.touch,height:T.control.touch,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center'},
 icon:{width:24,height:24}});
