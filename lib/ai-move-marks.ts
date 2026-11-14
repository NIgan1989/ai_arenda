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
 // The assignment is taken off and a replacement is only being looked for: not «нашёл замену» yet.
 ['owner:no-show:','job','released'],
 ['owner:overdue-remind:','job','reminded'],
 ['owner:overdue-silent:','job','reminded'],
 ['owner:overdue-escalated:','job','escalated'],
 ['owner:overdue-released:','job','released'],
 ['owner:matching-auto:','matching-offer','answered'],
 ['cleaner:autopilot-took:','cleaning-offer','took'],
 ['cleaner:checkout-reschedule:','job','moved'],
 ['cleaner:overdue-remind:','job','reminded'],
 ['cleaner:overdue-escalated:','job','escalated'],
 ['cleaner:overdue-released:','job','released'],
 ['cleaner:no-show:','job','released']
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
 took:'Автопилот взял уборку',moved:'ИИ перенёс время',reminded:'ИИ напомнил о сроке',escalated:'ИИ передал задержку',released:'ИИ снял назначение'
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

// ---------- The journal: everything the AI did for this person, one short line each ----------
// Wider than the map: it also keeps what has no pin (a price advice, a forecast, a deposit returned).
// Shown in the menu: under «Тариф и автопилот» for the cleaner, as its own short row for the guest and the owner.
// kind: what the id of the notice names. Besides the things a mark has, a note can name an application for a cleaning,
// a price advice, a calendar window, a forecast, an offer to change a stay or a chat: the server turns each into the
// booking, cleaning or home it is about (lib/ai-moves.ts), so every line says where it happened and opens it.
export type AiNote={kind:AiMark['kind']|''|'application'|'price'|'window'|'forecast'|'stay'|'room';id:string;text:string;at:number};
const NOTES:[string,AiNote['kind'],string][]=[
 ['owner:administrator-propose:','application','ИИ предложил исполнителя'],
 ['owner:administrator-review-issue:','job','ИИ нашёл замечания в отчёте'],
 ['owner:administrator-checkin-payment:','booking','ИИ попросил гостя оплатить'],
 ['owner:administrator-checkin-ready:','booking','ИИ ждёт готовности жилья'],
 ['owner:price:','price','ИИ посоветовал цену'],
 ['owner:window:','window','ИИ нашёл окно в календаре'],
 ['owner:forecast:','forecast','ИИ составил прогноз загрузки'],
 ['owner:autopilot-week:','','ИИ подвёл итоги недели'],
 ['owner:guest-question:','room','ИИ передал вопрос гостя'],
 ['guest:administrator-checkin-pay:','booking','ИИ попросил оплатить на месте'],
 ['owner:offer:','cleaning-offer','ИИ предложил уборку исполнителю'],
 // Payments are an imitation until the launch: the line says so, as the notice does.
 ['guest:test-deposit-return:','booking','ИИ вернул депозит (тест, без перевода)'],
 ['guest:stay:','stay','ИИ предложил изменить проживание'],
 ['guest:review-request:','booking','ИИ спросил, как прошло'],
 ['cleaner:day-plan:','','ИИ составил план дня'],
 ['cleaner:offer:','cleaning-offer','ИИ предложил уборку']
];
export function aiNoteOf(dedupe:unknown,at:unknown,body?:unknown):AiNote|null{
 const mark=aiMarkOf(dedupe,at,body);if(mark)return {kind:mark.kind,id:mark.id,text:AI_SAYS[mark.move],at:mark.at};
 if(typeof dedupe!=='string'||typeof at!=='number'||!Number.isFinite(at))return null;
 for(const [prefix,kind,text] of NOTES)if(dedupe.startsWith(prefix)){const id=dedupe.slice(prefix.length).split(':')[0];return {kind,id:kind?id:'',text,at};}
 return null;
}
// «сегодня 14:05», «вчера 09:30», «12.11 18:40», in Kazakhstan time (UTC+5) as everywhere in the service.
export function journalWhen(at:number,now:number){
 const zone=5*3600,d=new Date((at+zone)*1000),day=(t:number)=>Math.floor((t+zone)/86400),two=(n:number)=>String(n).padStart(2,'0');
 const clock=two(d.getUTCHours())+':'+two(d.getUTCMinutes()),ago=day(now)-day(at);
 return ago===0?'сегодня '+clock:ago===1?'вчера '+clock:two(d.getUTCDate())+'.'+two(d.getUTCMonth()+1)+' '+clock;
}
// How many of these lines are from today: the number next to the row of the menu.
export function journalToday(entries:{at:number}[],now:number){const zone=5*3600,day=(t:number)=>Math.floor((t+zone)/86400);return entries.filter(e=>day(e.at)===day(now)).length;}

// ---------- A line of the journal opens what it is about ----------
// open: the booking, the cleaning, the home or the chat of the line. The same addresses a push opens (lib/web-push.ts).
export type JournalOpen={kind:'booking'|'job'|'property'|'room';id:string};
export type JournalLine={at:number;text:string;title:string;open?:JournalOpen};
export function journalHref(role:string,open?:JournalOpen|null):string|null{
 if(!open||!/^[A-Za-z0-9_-]{1,100}$/.test(open.id)||!['guest','owner','cleaner'].includes(role))return null;
 const base='/workspace/'+role+'/';
 if(open.kind==='room')return base+'chats?room='+open.id;
 if(open.kind==='booking')return role==='cleaner'?null:base+'bookings?entity='+open.id;
 if(open.kind==='job')return role==='owner'?base+'cleaning?entity='+open.id:role==='cleaner'?base+'assignments?entity='+open.id:null;
 return role==='owner'?base+'properties?entity='+open.id:null;
}
// Two notices about one step (the owner is told twice, by two rules) read as one line: the same words about
// the same thing within the same minute are kept once. Lines come newest first.
export function mergeJournal<T extends JournalLine>(lines:T[]):T[]{
 const out:T[]=[];
 for(const l of lines){
  const last=out[out.length-1];
  if(last&&last.text===l.text&&last.title===l.title&&(last.open?.kind||'')===(l.open?.kind||'')&&(last.open?.id||'')===(l.open?.id||'')&&Math.floor(last.at/60)===Math.floor(l.at/60))continue;
  out.push(l);
 }
 return out;
}
