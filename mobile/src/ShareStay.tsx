import {t} from '../../lib/i18n';
import React from 'react';
import {Pressable,Share,StyleSheet} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {ShareIcon} from './ChatIcons';
import {shareLink,shareMessage,readShareStay,readStayLink,type ShareStay} from '../../lib/stay-share-text';
import {dailyStay} from '../../lib/map-search-request';
import type {MapStay} from './MapHome';
import type {Row} from './model';
import {isBath,isVenue} from '../../lib/listings';

// «Поделиться жильём» (concept 2026-11-27): a round button next to ♡ on the page of a place. The system sheet
// opens with the name, the price and a short link; with the dates of the search the friend sees the same stay.
export function ShareButton({title,onPress}:{title:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={t('Поделиться: {title}',{title})} hitSlop={8} onPress={onPress} style={({pressed})=>[b.round,pressed&&b.dim]}><ShareIcon color={C.ink} size={20}/></Pressable>;
}

// Only whole days travel in the link: hours and nights of a bath are chosen again by the friend.
export function stayOfMap(stay?:MapStay|null):ShareStay|null{
 if(!stay||stay.mode!=='daily')return null;
 const start=String(stay.start).slice(0,10),end=String(stay.end).slice(0,10);
 return readShareStay(new URLSearchParams({d:start+'~'+end,g:String(stay.guests||1)}));
}

export async function shareStay(property:Row,apiUrl:string,stay?:MapStay|null){
 const days=stayOfMap(stay),link=shareLink(apiUrl,String(property.id),days),type=String(property.details?.type||''),bath=isBath(type),hall=isVenue(type)&&!bath;
 // A hall's price depends on the guests and the evening: the friend sees it in the app, not in the message.
 const card={title:String(property.title||''),city:String(property.city||''),price:hall?0:bath?Number(property.policy?.hourly_price)||0:Number(property.price)||0,unit:(hall?'':bath?'hour':'day') as ''|'hour'|'day'};
 try{await Share.share({message:shareMessage(card,link,days),title:card.title});}catch{/* the sheet was closed */}
}

// A link from a friend (lib/stay-share-text.ts), with its days turned into the times of a daily stay.
export function parseStayLink(value:unknown,apiUrl:string):{id:string;stay:MapStay|null}|null{
 const found=readStayLink(value,apiUrl);if(!found)return null;
 const local=found.stay?dailyStay(found.stay.start,found.stay.end):null;
 return {id:found.id,stay:found.stay&&local?{mode:'daily',start:local.start,end:local.end,guests:found.stay.guests}:null};
}

const b=StyleSheet.create({
 // Plain like the ♡ beside it: two icons in one row, no rings.
 round:{width:36,height:36,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center'},
 dim:{opacity:0.6},
});
