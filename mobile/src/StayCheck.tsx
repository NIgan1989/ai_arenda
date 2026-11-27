import {tServer} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,Text} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {ApprovalCard} from './ApprovalCard';
import {s} from './styles';
type Row=Record<string,unknown>;
// «Вы заселились?» (lib/approvals.ts, kind stay-check) on the guest's cancelled booking in «Мои брони» (2026-11-27):
// the question is asked where the booking is, not in «Сводка», and the answer is a short line on the card, not a chat
// message. `said` is the answer already given (kept by the app: the question itself is gone once the answer is saved).
export function StayCheck({card,said,busy,onAnswer}:{card?:Approval;said?:string;busy:boolean;onAnswer:(body:Row)=>Promise<unknown>}){
 const [error,setError]=useState('');
 if(said)return <Text accessibilityLiveRegion="polite" style={s.meta}>{tServer(said)}</Text>;
 if(!card)return null;
 return <View style={{gap:8}}>
  <ApprovalCard card={card} busy={busy} onDecide={body=>{setError('');onAnswer(body).catch(e=>setError(String(e?.message||'')));}}/>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </View>;
}
