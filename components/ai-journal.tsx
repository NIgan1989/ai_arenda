'use client';
import {useState} from 'react';
import {journalWhen} from '../lib/ai-move-marks';
import './ai-journal.css';

// The journal of the AI administrator: what it did for this person, one short line each, the newest first.
// Three lines are shown; the rest open in place. It sits in the menu, where the autopilot is set up.
export type JournalEntry={at:number;text:string;title:string};
export function AiJournal({entries,now}:{entries:JournalEntry[];now:number}){
 const [all,setAll]=useState(false),shown=all?entries:entries.slice(0,3);
 if(!entries.length)return <p className="ai-journal-empty">Здесь появится короткая запись о каждом действии ИИ: что подтвердил, кого назначил, о чём напомнил.</p>;
 return <div className="ai-journal">
  <ul>{shown.map((e,i)=><li key={e.at+':'+i}><time>{journalWhen(e.at,now)}</time><span><b>{e.text}</b>{e.title&&<small> · {e.title}</small>}</span></li>)}</ul>
  {entries.length>3&&<button type="button" className="ai-journal-more" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Свернуть':'Показать все · '+entries.length}</button>}
 </div>;
}
