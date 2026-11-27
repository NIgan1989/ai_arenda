import {t as tr} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,StyleSheet} from 'react-native';
import {AiJournal,type JournalEntry} from './AiJournal';
import {Group} from './AccountRows';
import {AutopilotWeek} from './AutopilotWeek';
import {NativePayWay} from './AutopilotPlan';
import {NativeDecisionRules} from './DecisionRules';
import {SheetTabs} from './MainParts';
import type {JournalOpen} from '../../lib/ai-move-marks';

// The owner's «Автопилот» (concept mobbin autopilot-v2, 2026-11-27): on top whether the AI works and the tariff in one
// card (Muse's «Connected»), the week as one number with bars by day (timespent), three numbers in a row, then two tabs
// instead of one long page: what the AI did (the journal with an icon per step) and the rules for an unanswered question.
export function OwnerAutopilot({journal,now,tint,onOpen}:{journal:JournalEntry[];now:number;tint:string;onOpen?:(open:JournalOpen)=>(()=>void)|undefined}){
 const [tab,setTab]=useState<'done'|'rules'>('done');
 return <View>
  <NativePayWay role="owner" status/>
  <AutopilotWeek journal={journal}/>
  <View style={o.tabs}><SheetTabs value={tab} onChange={setTab} tabs={[{id:'done',title:tr('Что сделал')},{id:'rules',title:tr('Правила')}]}/></View>
  {tab==='done'?<Group><AiJournal entries={journal} now={now} onOpen={onOpen} icons/></Group>:<NativeDecisionRules tint={tint}/>}
 </View>;
}
const o=StyleSheet.create({tabs:{marginTop:20,marginBottom:4}});
