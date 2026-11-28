import {t} from '../../lib/i18n';
import React,{createContext,useContext,type ReactNode} from 'react';
import {Image,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View,type StyleProp,type ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {menuIcons,type MenuIcon} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';

// One small sheet over the screen for one choice or one step (board «Экраны старой версии», 2026-11-26): one head
// («‹» on the left when there is a step back, the name in the middle, «✕» on the right), the content, and the main
// button pinned to the bottom. As Airbnb opens «Кто?» or «Что изменить?» on its own sheet.
// bare: the content lays itself out with SheetPane (its own scroll and its own pinned buttons), as a form that keeps
// its swipe in its own state (the rating, the report of a cleaning, a decision) does.
export function PopSheet({visible,title,onClose,onBack,children,footer,bare=false}:{visible:boolean;title:string;onClose:()=>void;onBack?:()=>void;children:ReactNode;footer?:ReactNode;bare?:boolean}){
 const insets=useSafeAreaInsets();
 return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onBack||onClose}>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={p.fill}>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} style={p.shade}/>
   <View accessibilityViewIsModal style={[p.sheet,{paddingBottom:Math.max(16,insets.bottom+8)}]}>
    <View style={p.head}>
     {onBack?<Pressable accessibilityRole="button" accessibilityLabel={t('Назад')} hitSlop={8} onPress={onBack} style={p.side}><Text style={p.sign}>‹</Text></Pressable>:<View style={p.side}/>}
     <Text accessibilityRole="header" numberOfLines={1} style={p.title}>{title}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} hitSlop={8} onPress={onClose} style={p.side}><Text style={p.close}>✕</Text></Pressable>
    </View>
    {bare?<PaneContext.Provider value><View style={p.bare}>{children}</View></PaneContext.Provider>:<ScrollView style={p.body} contentContainerStyle={p.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>}
    {!!footer&&<View style={p.footer}>{footer}</View>}
   </View>
  </KeyboardAvoidingView>
 </Modal>;
}
// The body of a form and its main buttons. In a bare PopSheet the body scrolls and the buttons stay pinned to the
// bottom however long the body is (2026-11-26: «любые кнопки снизу и зафиксированы»); elsewhere (a card in a list)
// the buttons simply follow the body.
const PaneContext=createContext(false);
// Inside a bare sheet: the sheet's head already names the step, so a form leaves out its own small heading.
export const useInSheet=()=>useContext(PaneContext);
// style: the card the form is drawn in outside a sheet (a sheet is its own card).
export function SheetPane({children,footer,style}:{children:ReactNode;footer?:ReactNode;style?:StyleProp<ViewStyle>}){
 const inSheet=useContext(PaneContext);
 if(!inSheet)return <View style={style}>{children}{footer}</View>;
 return <><ScrollView style={p.body} contentContainerStyle={p.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>{!!footer&&<View style={p.footer}>{footer}</View>}</>;
}
// A row of a sheet's list: a black line icon, the words, «›». Danger rows are red and have no arrow.
export function PopRow({icon,title,value,onPress,danger=false,disabled=false,last=false}:{icon?:MenuIcon;title:string;value?:string;onPress:()=>void;danger?:boolean;disabled?:boolean;last?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={value?title+', '+value:title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[p.row,last&&p.last,(pressed||disabled)&&p.dim]}>
  {!!icon&&<Image source={menuIcons[icon]} style={[p.icon,danger&&{tintColor:C.danger}]} accessibilityElementsHidden importantForAccessibility="no"/>}
  <Text numberOfLines={2} style={[p.rowText,danger&&{color:C.danger}]}>{title}</Text>
  {!!value&&<Text numberOfLines={1} style={p.value}>{value}</Text>}
  {!danger&&<Text style={p.chevron}>›</Text>}
 </Pressable>;
}
// The same row inside a card or a sheet, not in a list: «название · значение ›». A tap opens its own small sheet.
export function LineRow({title,value,onPress,disabled=false,dot,label}:{title:string;value?:string;onPress:()=>void;disabled?:boolean;dot?:string;label?:string}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label||(value?title+', '+value:title)} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[p.line,(pressed||disabled)&&p.dim]}>
  {!!dot&&<View style={[p.dot,{backgroundColor:dot}]}/>}
  <View style={p.grow}><Text numberOfLines={2} style={value?p.lineKey:p.lineTitle}>{title}</Text>{!!value&&<Text numberOfLines={2} style={p.lineValue}>{value}</Text>}</View>
  <Text style={p.chevron}>›</Text>
 </Pressable>;
}
const p=StyleSheet.create({
 fill:{flex:1},
 shade:{flex:1,backgroundColor:'rgba(33,32,28,0.32)'},
 sheet:{maxHeight:'88%',borderTopLeftRadius:T.radius.xl,borderTopRightRadius:T.radius.xl,backgroundColor:C.surface},
 head:{flexDirection:'row',alignItems:'center',minHeight:56,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:C.line},
 side:{width:T.control.touch,height:T.control.touch,alignItems:'center',justifyContent:'center'},
 sign:{fontSize:28,lineHeight:32,color:C.ink},close:{...type.body,color:C.ink,fontWeight:'600'},
 title:{...type.body,flex:1,textAlign:'center',color:C.ink,fontWeight:'600'},
 body:{flexGrow:0,flexShrink:1},bare:{flexShrink:1},content:{paddingHorizontal:20,paddingTop:12,paddingBottom:12,gap:12},
 footer:{paddingHorizontal:20,paddingTop:12,gap:8,borderTopWidth:1,borderTopColor:C.line},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,borderBottomWidth:1,borderBottomColor:C.line},last:{borderBottomWidth:0},
 icon:{width:20,height:20,tintColor:C.ink},rowText:{...type.body,flex:1,color:C.ink},value:{...type.label,color:C.muted,maxWidth:'45%'},
 chevron:{...type.subtitle,color:C.muted},dim:{opacity:.5},grow:{flex:1,minWidth:0},
 line:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.field,paddingVertical:8,paddingHorizontal:16,borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,backgroundColor:C.surface},
 dot:{width:8,height:8,borderRadius:4},
 lineKey:{...type.caption,color:C.muted},lineValue:{...type.body,color:C.ink,fontWeight:'600'},lineTitle:{...type.body,color:C.ink,fontWeight:'600'},
});
