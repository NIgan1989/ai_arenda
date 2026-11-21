import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {LiveMap} from './LiveMap';
import {geoDistance} from '../../lib/map-location';
import type {MapPoint} from './map-math';
type Row=Record<string,any>;

// What the «Адрес» step will save as the flat's pin: point is null while there is nothing worth saving
// (the house was not found and the owner has not moved the map).
export type PinChoice={point:MapPoint|null;moved:boolean;saved:boolean};
export type Spot={longitude:number;latitude:number;found:boolean;saved:boolean;version:number};

// The flat's pin in the «Адрес» step. The service finds the house by the address being typed (city, district, address)
// and the map flies there; the pin stays in the middle and the owner moves the map under it if the house is a bit off.
export function AddressPin({propertyId,city,district,address,place='',call,onChoice}:{propertyId:string;city:string;district:string;address:string;place?:string;call:(path:string,body:Row)=>Promise<Row>;onChoice:(choice:PinChoice)=>void}){
 const [spot,setSpot]=useState<Spot|null>(null),[answered,setAnswered]=useState(''),[moved,setMoved]=useState(false),[failed,setFailed]=useState(false),[round,setRound]=useState(0);
 const report=useRef(onChoice);useEffect(()=>{report.current=onChoice;},[onChoice]);
 // The address being typed; the note says «Ищу…» until the answer for exactly this address arrives.
 const asked=[city,district,address,place].join('|'),looking=answered!==asked;
 // Ask again a moment after the owner stops typing; an older answer never overwrites a newer one.
 useEffect(()=>{
  let live=true;
  // A pin chosen for the old address is forgotten at once: until the new one is found, «Сохранить» keeps the service's own pin.
  report.current({point:null,moved:false,saved:false});
  const timer=setTimeout(async()=>{
   try{const next=await call('map/spot',{propertyId,city,district,address,...(place?{place}:{})}) as Spot;if(!live)return;
    setSpot(next);setFailed(false);setMoved(false);setRound(n=>n+1);
    report.current({point:next.found?[next.longitude,next.latitude]:null,moved:false,saved:!!next.saved});}
   catch{if(live)setFailed(true);}
   finally{if(live)setAnswered(asked);}
  },round?1200:0);
  return()=>{live=false;clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[propertyId,asked]);
 // The map reports its middle after every move: a move of more than a few metres from the found house is the owner's own choice.
 const onCenter=(c:MapPoint)=>{
  // The map of the old address can still report while the new one is looked up: that is not the owner's choice.
  if(!spot||looking)return;const away=geoDistance(c,[spot.longitude,spot.latitude])>4;
  if(away!==moved)setMoved(away);
  report.current(away?{point:[Number(c[0].toFixed(6)),Number(c[1].toFixed(6))],moved:true,saved:false}:{point:spot.found?[spot.longitude,spot.latitude]:null,moved:false,saved:spot.saved});
 };
 const note=failed?t('Карта не ответила. Адрес сохранится, метку поставим по нему.')
  :looking&&!spot?t('Ищу дом по адресу…')
  :moved?t('Метка будет здесь. Нажмите «Сохранить».')
  :looking?t('Ищу дом по новому адресу…')
  :spot?.saved?t('Метка стоит на доме. Если чуть мимо, передвиньте карту.')
  :spot?.found?t('Нашёл дом по адресу. Проверьте метку и сохраните.')
  :t('Не нашёл дом по адресу. Передвиньте карту так, чтобы метка стояла на вашем доме.');
 const warn=!looking&&!moved&&!!spot&&!spot.found;
 return <View style={a.box}>
  <Text style={a.label}>{t('Метка на карте')}</Text>
  <View style={a.map}>
   {spot?<LiveMap key={'pin:'+round} center={[spot.longitude,spot.latitude]} pins={[]} picking focusKey={'pin:'+round} restore={{view:{center:[spot.longitude,spot.latitude],zoom:spot.found?16:12},key:'pin:'+round}} onCenter={onCenter}/>
    :<View style={a.wait}><Text style={a.note}>{t('Ищу дом по адресу…')}</Text></View>}
  </View>
  <Text accessibilityLiveRegion="polite" style={[a.note,warn&&a.warn]}>{note}</Text>
 </View>;
}
const a=StyleSheet.create({
 box:{gap:4},
 label:{color:C.muted,...type.caption,fontWeight:'600'},
 map:{height:220,borderRadius:T.radius.md,overflow:'hidden',borderWidth:1,borderColor:C.line,backgroundColor:C.surfaceAlt},
 wait:{flex:1,alignItems:'center',justifyContent:'center'},
 note:{color:C.muted,...type.caption},warn:{color:C.warning,fontWeight:'600'}
});
