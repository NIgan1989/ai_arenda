import React from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {bookingTabs,type BookingTab} from '../../lib/booking-filters';
// «Активные · Завершённые · Отменённые» over «Мои брони»: one segmented row, each tab with its count; an empty tab stays tappable but quiet.
export function BookingTabs({value,counts,onChange}:{value:BookingTab;counts:Record<BookingTab,number>;onChange:(tab:BookingTab)=>void}){
 return <View accessibilityRole="tablist" accessibilityLabel="Брони" style={b.seg}>{bookingTabs.map(({id,label})=>{const on=id===value,n=counts[id];
  return <Pressable key={id} accessibilityRole="tab" accessibilityLabel={label+', '+n} accessibilityState={{selected:on}} onPress={()=>{if(!on)onChange(id);}} style={({pressed})=>[b.item,on&&b.on,pressed&&!on&&b.pressed]}>
   <Text numberOfLines={1} style={[b.text,on&&b.textOn,!n&&!on&&b.empty]}>{label}</Text>{n>0&&<Text style={[b.count,on&&b.countOn]}>{n}</Text>}
  </Pressable>;})}</View>;
}
const R=T.radius;
const b=StyleSheet.create({
 seg:{flexDirection:'row',gap:4,padding:4,marginBottom:4,borderRadius:R.lg,backgroundColor:C.surfaceAlt},
 item:{flex:1,minHeight:40,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,paddingHorizontal:4,borderRadius:R.md},
 on:{backgroundColor:C.surface,shadowColor:'#000',shadowOpacity:.08,shadowRadius:4,shadowOffset:{width:0,height:1},elevation:1},pressed:{opacity:.6},
 text:{...type.caption,fontWeight:'600',color:C.muted},textOn:{color:C.ink},empty:{opacity:.6},
 count:{...type.caption,color:C.muted},countOn:{color:C.accentPressed,fontWeight:'700'},
});
