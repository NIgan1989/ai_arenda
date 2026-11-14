'use client';
import {useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {journalHref,journalWhen,type JournalLine} from '../lib/ai-move-marks';
import {goWorkspace} from '../lib/workspace-go';
import './ai-journal.css';

// The journal of the AI administrator: what it did for this person, one short line each, the newest first.
// Three lines are shown; the rest open in place. It sits in the menu, where the autopilot is set up.
// A line opens what it is about: the card of the cleaning or of the booking, the home, or the chat.
export type JournalEntry=JournalLine;
export function AiJournal({entries,now,role}:{entries:JournalEntry[];now:number;role:string}){
 const [all,setAll]=useState(false),shown=all?entries:entries.slice(0,3);
 if(!entries.length)return <p className="ai-journal-empty">Здесь появится короткая запись о каждом действии ИИ: что подтвердил, кого назначил, о чём напомнил.</p>;
 return <div className="ai-journal">
  <ul>{shown.map((e,i)=>{
   const href=journalHref(role,e.open),line=<><time>{journalWhen(e.at,now)}</time><span><b>{e.text}</b>{e.title&&<small> · {e.title}</small>}</span></>;
   return <li key={e.at+':'+i}>{href?<button type="button" className="ai-journal-line" onClick={()=>goWorkspace(href)}>{line}<ChevronRight size={16} aria-hidden="true"/></button>:<div className="ai-journal-line">{line}</div>}</li>;
  })}</ul>
  {entries.length>3&&<button type="button" className="ai-journal-more" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Свернуть':'Показать все · '+entries.length}</button>}
 </div>;
}
