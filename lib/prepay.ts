import {checkinOpen} from './checkin-window';
import {t} from './i18n';

type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// «Предоплата или оплата при заселении»: how a guest pays the owner directly (lib/payout.ts).
// The owner chooses a share paid after the confirmation (prepay_percent: 10, 20, 30, 50 or 100), the rest and the
// deposit at the arrival; 0 means everything at the arrival. A place takes prepayments only after PREPAY_AFTER
// completed stays without trouble: until then every guest pays when they are at the door, so a new owner cannot take
// money for a home that is not there. The share in force is kept in the booking (booking_terms.prepay_percent) when
// the request is made; NULL is a booking made before this rule, paid in full in advance as it was agreed.
export const PREPAY_AFTER=5;
export const PREPAY_CHOICES=[0,10,20,30,50,100] as const;
export function prepayChoice(value:unknown){const n=Number(value);return (PREPAY_CHOICES as readonly number[]).includes(n)?n:null;}
export const prepayLabel=(percent:number)=>percent>0?(percent>=100?t('Предоплата 100%'):t('Предоплата {percent}%, остальное при заселении',{percent})):t('Оплата при заселении');

export type PrepayState={wanted:number;percent:number;completed:number;left:number};
// The owner's choice and the share in force now: 0 while the place has fewer than PREPAY_AFTER completed stays.
export function prepayState(wanted:unknown,completed:number):PrepayState{
 const w=prepayChoice(wanted)??0,left=Math.max(0,PREPAY_AFTER-completed);
 return {wanted:w,percent:left?0:w,completed,left};
}

/** The owner's words under the choice: what guests of this place see now. */
export function prepayNote(s:PrepayState){
 if(!s.left)return s.percent?prepayLabel(s.percent)+'.':t('Гости платят при заселении.');
 const v={after:PREPAY_AFTER,completed:s.completed,wanted:s.wanted};
 return s.wanted?t('Пока у жилья меньше {after} завершённых броней (сейчас {completed}), все гости платят при заселении. Предоплата {wanted}% включится сама после {after}-й брони.',v):t('Пока у жилья меньше {after} завершённых броней (сейчас {completed}), все гости платят при заселении.',v);
}

export const prepayOf=(terms:Row|null|undefined)=>terms?.prepay_percent==null?100:Number(terms.prepay_percent)||0;
export const prepaySum=(amount:number,percent:number)=>percent>=100?Math.max(0,Number(amount)||0):Math.ceil((Math.max(0,Number(amount)||0)*percent)/100);

export type Due={left:number;deposit:number;sum:number;reported:boolean;phase:'prepay'|'arrival'};
// What the guest owes the owner now. Before the arrival opens (15 minutes before the check-in, or when the owner let
// the guest in earlier) only the prepayment is due; from then on the rest of the stay and the deposit. A booking
// paid in full in advance (100% or one made before this rule) owes everything, the deposit too, from the confirmation.
export function dueNow(b:Row,now:number):Due{
 const t=b.terms||{},percent=prepayOf(t),paid=Number(t.paid_amount)||0,amount=Number(b.amount)||0;
 const arrival=percent>=100||checkinOpen(Number(b.start),now,t.early_checkin_at);
 const left=Math.max(0,(arrival?amount:prepaySum(amount,percent))-paid);
 const deposit=arrival&&Number(t.deposit)>0&&t.deposit_status==='pending'?Number(t.deposit):0;
 return {left,deposit,sum:left+deposit,reported:(!left||!!t.payment_reported_at)&&(!deposit||!!t.deposit_reported_at),phase:arrival?'arrival':'prepay'};
}
/** The payout details are shown when something can be paid: after the confirmation with a prepayment, at the arrival without. */
export const payoutOpen=(b:Row,now:number)=>prepayOf(b.terms)>0||checkinOpen(Number(b.start),now,b.terms?.early_checkin_at);
