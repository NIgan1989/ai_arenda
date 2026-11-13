// What the AI administrator did on its own, read from the notices it leaves (lib/ai-moves.ts gives them to the map).
// The map shows each with one sign, the same in every role: an AI ring runs round the pin once and a short line lifts
// above it («ИИ подтвердил бронь»). Pure, no imports: the site, the app and the server share it.
// Covered by mobile/tests/ai-moves.test.mjs. It lives in lib so the server can use it too.

export type AiMove='confirmed'|'answered'|'checkin'|'checkout'|'checked'|'accepted'|'assigned'|'replaced'|'took'|'moved'|'reminded'|'escalated'|'released';
// kind: what the notice is about. An offer is turned into its property or job by the server.
// propertyId: the object it happened at (the server adds it), so the owner's pin of the object shows a move about
// a booking or a cleaning that has already left the map, like a cleaning just accepted.
export type AiMark={kind:'booking'|'job'|'property'|'matching-offer'|'cleaning-offer';id:string;move:AiMove;at:number;propertyId?:string};
// A move is shown on the map for this long after it happened, so a map opened a little later still sees it.
export const AI_WINDOW=600;

// The notice keys the AI writes (role:key:id[:more]) and what each one means.
const KEYS:[string,AiMark['kind'],AiMove][]=[
 ['owner:administrator-confirmed:','booking','confirmed'],
 ['owner:administrator-checkin:','booking','checkin'],
 ['owner:administrator-checkout:','booking','checkout'],
 ['owner:administrator-review:','job','checked'],
 ['owner:administrator-approved:','job','accepted'],
 ['owner:administrator-assigned:','job','assigned'],
 ['owner:regular-assigned:','job','assigned'],
 ['owner:no-show:','job','replaced'],
 ['owner:overdue-remind:','job','reminded'],
 ['owner:overdue-silent:','job','reminded'],
 ['owner:overdue-escalated:','job','escalated'],
 ['owner:overdue-released:','job','released'],
 ['owner:matching-auto:','matching-offer','answered'],
 ['cleaner:autopilot-took:','cleaning-offer','took'],
 ['cleaner:checkout-reschedule:','job','moved'],
 ['cleaner:overdue-remind:','job','reminded'],
 ['cleaner:overdue-escalated:','job','escalated']
];
export function aiMarkOf(dedupe:unknown,at:unknown,body?:unknown):AiMark|null{
 if(typeof dedupe!=='string'||typeof at!=='number'||!Number.isFinite(at))return null;
 // A booking the AI confirmed at once shares its notice with a new request; only its words tell them apart.
 if(dedupe.startsWith('owner:booking:')){const id=dedupe.slice(14).split(':')[0];return id&&typeof body==='string'&&body.startsWith('AI администратор принял бронь')?{kind:'booking',id,move:'confirmed',at}:null;}
 for(const [prefix,kind,move] of KEYS)if(dedupe.startsWith(prefix)){const id=dedupe.slice(prefix.length).split(':')[0];return id?{kind,id,move,at}:null;}
 return null;
}

// What the line above the pin says.
export const AI_SAYS:Record<AiMove,string>={
 confirmed:'ИИ подтвердил бронь',answered:'ИИ ответил гостю',checkin:'ИИ заселил гостя',checkout:'ИИ подтвердил выезд',
 checked:'ИИ проверил отчёт',accepted:'ИИ принял уборку',assigned:'ИИ назначил исполнителя',replaced:'ИИ нашёл замену',
 took:'Автопилот взял уборку',moved:'ИИ перенёс время',reminded:'ИИ напомнил о сроке',escalated:'ИИ передал задержку',released:'ИИ снял исполнителя'
};

// The newest move about any of these things, still within the window: the one a pin shows.
export function latestMove(marks:unknown,about:{kind:string;id:string}[],now:number):{move:AiMove;at:number}|undefined{
 if(!Array.isArray(marks))return undefined;
 let best:{move:AiMove;at:number}|undefined;
 for(const m of marks as AiMark[]){
  if(!m||typeof m.at!=='number'||!(m.move in AI_SAYS)||now-m.at>AI_WINDOW||m.at>now+60)continue;
  if(!about.some(a=>a.kind===m.kind&&a.id===m.id||a.kind==='property'&&a.id===m.propertyId))continue;
  if(!best||m.at>best.at)best={move:m.move,at:m.at};
 }
 return best;
}
