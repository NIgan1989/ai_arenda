import React,{useState} from 'react';
import {Linking,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SwipeConfirm} from './SwipeConfirm';
import {API_URL,isOffline,request} from './api';
import {C,s} from './styles';

export type LegalState={edition:string;missing:string[];documents:{id:string;title:string;path:string}[]};

// What each document means for the person, in one line, so the sheet says what is accepted before the swipe.
const WHAT:Record<string,string>={
 terms:'Общие правила сервиса для всех участников.',
 consent:'Какие данные сервис обрабатывает и зачем.',
 owner:'Плата сервису за брони, подбор уборки и «Автопилот», списание с привязанной карты раз в неделю, что ИИ-администратор делает от вашего имени.',
 cleaner:'Заказы и оплата напрямую от владельца, «Автопилот» по желанию, без комиссии с уборок.',
};
const LEAD:Record<string,string>={
 owner:'Чтобы сдавать жильё, примите оферту для владельцев.',
 cleaner:'Чтобы брать заказы на уборку, примите оферту для исполнителей.',
};

// One sheet, one swipe: the documents a role still has to accept (lib/legal-acceptance.ts). Until then the
// workspace takes no new actions; the person can still read the documents, go back to the roles or leave.
// The server keeps who accepted which edition and when.
export function LegalAccept({legal,role,onAccepted,onLeave}:{legal:LegalState;role:string;onAccepted:()=>void;onLeave:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const offer=legal.missing.find(doc=>doc==='owner'||doc==='cleaner');
 const lead=offer?LEAD[offer]:legal.edition&&legal.missing.length?'Условия сервиса обновились '+legal.edition+'. Прочитайте и примите их, чтобы продолжить.':'';
 const open=(path:string)=>void Linking.openURL(API_URL+path+'?from=app').catch(()=>setError('Не удалось открыть документ.'));
 const accept=async()=>{
  setBusy(true);setError('');
  try{await request('/api/legal/accept',{documents:legal.missing,edition:legal.edition},undefined,undefined,role);onAccepted();}
  catch(e){setError(isOffline(e)?'Нет связи. Проверьте интернет и повторите.':(e as Error).message);}
  finally{setBusy(false);}
 };
 return <Modal visible animationType="slide" onRequestClose={onLeave}>
  <SafeAreaView style={s.screen} edges={['top','bottom']}>
   <ScrollView contentContainerStyle={{padding:16,gap:12}} accessibilityViewIsModal>
    <Text accessibilityRole="header" style={s.cardTitle}>Условия сервиса</Text>
    {!!lead&&<Text style={s.text}>{lead}</Text>}
    {legal.documents.map(doc=><Pressable key={doc.id} accessibilityRole="link" accessibilityLabel={'Открыть: '+doc.title} onPress={()=>open(doc.path)} style={({pressed})=>[s.card,{marginTop:0,gap:4},pressed&&{opacity:.7}]}>
     <Text style={[s.text,{fontWeight:'600'}]}>{doc.title}</Text>
     {!!WHAT[doc.id]&&<Text style={s.meta}>{WHAT[doc.id]}</Text>}
     <Text style={[s.meta,{color:C.accent}]}>Прочитать</Text>
    </Pressable>)}
    <Text style={s.meta}>Редакция от {legal.edition}. Проводя ползунок, вы принимаете эти документы целиком. Сервис сохранит, когда и какую редакцию вы приняли.</Text>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <SwipeConfirm label={busy?'Сохраняю…':'Проведите, чтобы принять'} disabled={busy} onConfirm={()=>void accept()}/>
    <Pressable accessibilityRole="button" onPress={onLeave} disabled={busy} style={{minHeight:44,justifyContent:'center',alignItems:'center'}}><Text style={s.meta}>Не сейчас, к выбору роли</Text></Pressable>
   </ScrollView>
  </SafeAreaView>
 </Modal>;
}
