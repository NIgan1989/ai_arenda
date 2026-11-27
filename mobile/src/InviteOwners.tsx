import {dateText,plural,t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,Share,StyleSheet} from 'react-native';
import {request,API_URL} from './api';
import {ThinkingLine} from './Thinking';
import {Btn,Group,a} from './AccountRows';
import {inviteLink,normalizeInviteCode} from '../../lib/invite-text';
import {s,C,type} from './styles';
import {T} from './tokens';

// «Пригласить владельца» (concept 2026-11-27, lib/invites.ts): the terms, three steps, the code and one dark button.
// Below: who came by the code and, before the first booking, a field for a code of one's own.
type Bonus={days:number;from:number|null;until:number|null};
type Friend={name:string;redeemedAt:number;bonus:Bonus|null;state:'waiting'|'active'|'used'|'limit'};
type State={code:string;days:number;now:number;friends:Friend[];came:{code:string;by:string;partner:boolean;bonus:Bonus|null}|null;canRedeem:boolean;limit:{used:number;max:number}};
const day=(at:number)=>dateText(at*1000,{day:'numeric',month:'long',timeZone:'Asia/Almaty'});
// A partner's code can give any number of days (1–180), so the word follows the number.
const days=(n:number)=>n+' '+plural(n,['день','дня','дней'],['day','days'],'күн');

export function InviteOwners({initialCode='',tint=C.ink}:{initialCode?:string;tint?:string}){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [code,setCode]=useState(initialCode),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;request('/api/operations/invite/state',undefined,undefined,undefined,'owner').then(v=>{if(live)setState(v);}).catch((e:unknown)=>{if(live)setError(e instanceof Error&&e.message?e.message:t('Не удалось загрузить.'));});return()=>{live=false;};},[]);
 if(!state)return error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:<ThinkingLine style={s.meta} text={t('Загружаем…')}/>;
 const link=inviteLink(API_URL,state.code);
 const share=()=>void Share.share({message:t('Сдаю жильё через AiQonaq, попробуйте и вы. По моему коду {code} первые {days} дней с первой брони без комиссии.',{code:state.code,days:state.days})+'\n'+link,title:t('Месяц без комиссии')}).catch(()=>undefined);
 async function redeem(){
  const value=normalizeInviteCode(code);if(!value||busy)return;
  setBusy(true);setError('');setMessage('');
  try{const r=await request('/api/operations/invite/redeem',{code:value},undefined,undefined,'owner');setState(r.state);setMessage(t('Код принят. {days} без комиссии начнутся с первой брони через приложение.',{days:days(r.state?.came?.bonus?.days||state!.days)}));}
  catch(e){setError(e instanceof Error&&e.message?e.message:t('Не удалось применить код.'));}
  finally{setBusy(false);}
 }
 const status=(f:Friend)=>f.state==='waiting'?t('Ждём первую бронь'):f.state==='active'&&f.bonus?.until?t('Без комиссии до {date}',{date:day(f.bonus.until)}):f.state==='used'?t('Месяц использован'):t('Лимит этого года исчерпан');
 const came=state.came,cameBonus=came?.bonus;
 const cameLine=!came?'':!cameBonus||cameBonus.from==null?t('{days} без комиссии начнутся с первой брони через приложение.',{days:days(cameBonus?.days||state.days)}):cameBonus.until!>state.now?t('Без комиссии до {date}.',{date:day(cameBonus.until!)}):t('Дни без комиссии использованы.');
 return <View>
  <Text accessibilityRole="header" style={v.big}>{t('Месяц без комиссии вам и другу')}</Text>
  <Text style={v.line}>{t('Для владельцев жилья, бань и залов.')}</Text>
  <View style={v.steps}>
   {[t('Отправьте ссылку знакомому владельцу.'),t('Он добавляет жильё и вводит ваш код.'),t('После его первой брони у вас обоих {days} дней без комиссии.',{days:state.days})].map((text,i)=><View key={i} style={v.step}><View style={[v.num,{borderColor:tint}]}><Text style={v.numText}>{i+1}</Text></View><Text style={v.stepText}>{text}</Text></View>)}
  </View>
  <View accessible accessibilityLabel={t('Ваш код: {code}',{code:state.code.split('').join(' ')})} style={v.code}><Text style={v.codeLabel}>{t('Ваш код')}</Text><Text selectable style={v.codeText}>{state.code}</Text></View>
  <Btn title={t('Поделиться ссылкой')} onPress={share}/>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}
  {state.friends.length>0&&<Group title={t('Пришли по вашему коду: {n}',{n:state.friends.length})}>{state.friends.map((f,i)=><View key={i} style={a.row}><View style={a.wide}><Text style={a.title}>{f.name}</Text><Text style={a.note}>{status(f)}</Text></View></View>)}</Group>}
  {!!came&&<Group title={t('Вы пришли по коду')}><View style={a.row}><View style={a.wide}><Text style={a.title}>{came.code}{came.by?' · '+came.by:''}</Text><Text style={a.note}>{cameLine}</Text></View></View></Group>}
  {state.canRedeem&&<Group title={t('У меня есть код')}><View style={a.body}>
   <TextInput accessibilityLabel={t('Код приглашения')} value={code} onChangeText={v=>{setCode(v);setError('');}} autoCapitalize="characters" autoCorrect={false} maxLength={30} placeholder="DULAT482" placeholderTextColor={C.muted} style={[s.field,{marginTop:12}]} onSubmitEditing={()=>void redeem()} returnKeyType="done"/>
   <Text style={a.note}>{t('Код вводят один раз, до первой брони через приложение.')}</Text>
   <Btn kind="line" title={busy?t('Проверяем…'):t('Применить код')} disabled={busy||normalizeInviteCode(code).length<4} onPress={()=>void redeem()}/>
  </View></Group>}
  <Text style={a.footnote}>{t('За приглашения не больше {max} месяцев без комиссии в год. Дни не меняются на деньги. Условия в оферте, п. 5.13.',{max:state.limit.max})}</Text>
 </View>;
}

const v=StyleSheet.create({
 big:{...type.title,color:C.ink,fontWeight:'600',marginTop:4},
 line:{...type.label,color:C.muted,marginTop:4},
 steps:{gap:12,marginTop:16},
 step:{flexDirection:'row',alignItems:'flex-start',gap:12},
 num:{width:26,height:26,borderRadius:T.radius.full,borderWidth:1,alignItems:'center',justifyContent:'center'},
 numText:{...type.caption,color:C.ink,fontWeight:'600'},
 stepText:{...type.body,color:C.ink,flex:1,minWidth:0},
 code:{marginTop:20,paddingHorizontal:16,paddingVertical:12,borderRadius:T.radius.lg,backgroundColor:C.surfaceAlt},
 codeLabel:{...type.caption,color:C.muted},
 codeText:{...type.title,color:C.ink,fontWeight:'600',letterSpacing:1},
});
