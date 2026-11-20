import React,{useState} from 'react';
import {Linking,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {API_URL,isOffline,request} from './api';
import {C,s,type} from './styles';
import {T} from './tokens';

export type LegalState={edition:string;missing:string[];documents:{id:string;title:string;path:string}[]};

// The one thing an offer changes for the person, so the key terms are seen before the tap.
const OFFER:Record<string,{title:string;note:string}>={
 owner:{title:'Чтобы сдавать жильё',note:'Плата сервису списывается с привязанной карты раз в неделю.'},
 cleaner:{title:'Чтобы брать заказы на уборку',note:'Оплата за уборки приходит напрямую от владельца.'},
};

// A short card at the bottom, as other services do: one sentence with the documents as links and one button.
// The documents a role still has to accept come from lib/legal-acceptance.ts; until then the workspace takes no new
// actions, and «Не сейчас» hides the card so the person can still read, chat, change settings or leave.
// Pressing «Принимаю» is the acceptance (silence is not); the server keeps who accepted which edition and when.
export function LegalAccept({legal,role,onAccepted,onLeave}:{legal:LegalState;role:string;onAccepted:()=>void;onLeave:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const offer=legal.missing.find(doc=>doc==='owner'||doc==='cleaner'),about=offer?OFFER[offer]:null;
 const open=(path:string)=>void Linking.openURL(API_URL+path+'?from=app').catch(()=>setError('Не удалось открыть документ.'));
 const accept=async()=>{
  setBusy(true);setError('');
  try{await request('/api/legal/accept',{documents:legal.missing,edition:legal.edition},undefined,undefined,role);onAccepted();}
  catch(e){setError(isOffline(e)?'Нет связи. Проверьте интернет и повторите.':(e as Error).message);}
  finally{setBusy(false);}
 };
 const docs=legal.documents;
 const links=docs.map((doc,i)=><React.Fragment key={doc.id}>{i?i===docs.length-1?' и ':', ':''}<Text accessibilityRole="link" onPress={()=>open(doc.path)} style={l.link}>{doc.title}</Text></React.Fragment>);
 return <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onLeave}>
  <View style={l.backdrop}>
   <SafeAreaView edges={['bottom']} style={l.card} accessibilityViewIsModal>
    {/* With large system text the card may outgrow the screen: it stops at 90% and scrolls, so the documents stay reachable. */}
    <ScrollView contentContainerStyle={l.content} bounces={false}>
    <Text accessibilityRole="header" style={l.title}>{about?about.title:'Условия обновились'}</Text>
    <Text style={l.body}>Нажимая «Принимаю», вы соглашаетесь с {docs.length>1?'документами':'документом'}: {links}.</Text>
    <Text style={s.meta}>{about?about.note+' ':''}Редакция от {legal.edition}.</Text>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void accept()} style={({pressed})=>[s.button,(busy||pressed)&&s.disabled]}><Text style={s.buttonText}>{busy?'Сохраняю…':'Принимаю'}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onLeave} disabled={busy} style={l.later}><Text style={s.meta}>Не сейчас</Text></Pressable>
    </ScrollView>
   </SafeAreaView>
  </View>
 </Modal>;
}

const l={
 backdrop:{flex:1,justifyContent:'flex-end' as const,backgroundColor:C.scrim},
 card:{maxHeight:'90%' as const,backgroundColor:C.surface,borderTopLeftRadius:T.radius.lg,borderTopRightRadius:T.radius.lg},
 content:{paddingHorizontal:20,paddingTop:20,gap:12},
 title:{...type.subtitle,color:C.ink,fontWeight:'600' as const},
 body:{...type.body,color:C.ink},
 link:{color:C.accent,textDecorationLine:'underline' as const},
 later:{minHeight:T.control.touch,justifyContent:'center' as const,alignItems:'center' as const},
};
