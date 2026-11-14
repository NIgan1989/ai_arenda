// «Задерживаюсь на час»: a guest who will arrive later says so before the AI administrator asks. Pure, no imports:
// the site, the app and the server share it (lib/stay-watch.ts, lib/guest-trips.ts, mobile/App.tsx).

// The button opens three hours before the arrival; each press moves the arrival one hour, at most three times,
// never past the end of the stay.
export const LATE_OPENS=3*3600,LATE_STEP=3600,LATE_MAX=3;

type Stay={start:number;end:number;arrival_eta?:number|null;late_count?:number|null};

// When the guest is expected: the agreed arrival, or the later time the guest gave.
export function arrivalDue(b:{start:number;arrival_eta?:number|null}){return Math.max(Number(b.start),Number(b.arrival_eta)||0);}

// The next arrival time a guest who is running late may give, or null when there is nothing left to move.
export function lateUntil(b:Stay,now:number){
 if((Number(b.late_count)||0)>=LATE_MAX)return null;
 const until=Math.max(arrivalDue(b),now)+LATE_STEP;
 return until<Number(b.end)?until:null;
}

// The button is shown from three hours before the arrival while the guest has not checked in.
export function lateOpen(b:Stay,now:number){return Number(b.start)-LATE_OPENS<=now&&lateUntil(b,now)!==null;}

// «Вы приедете к 15:30»: the time the guest gave, for the card of the booking.
export function lateNote(b:{arrival_eta?:number|null;start:number},now:number){
 const eta=Number(b.arrival_eta)||0;if(!eta||eta<=Number(b.start))return '';
 const d=new Date((eta+5*3600)*1000),hm=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');
 return eta>now?'Владелец предупреждён: вы приедете к '+hm+'.':'Вы обещали приехать к '+hm+'.';
}

// «Задерживаюсь на час», then «Задерживаюсь ещё на час» once the guest has moved the arrival.
export function lateLabel(b:{late_count?:number|null}){return (Number(b.late_count)||0)>0?'Задерживаюсь ещё на час':'Задерживаюсь на час';}
