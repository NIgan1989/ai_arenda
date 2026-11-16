// What a cancellation costs, by the guest offer (lib/legal-documents.ts, section 5):
// the owner cancelling, an unconfirmed request, or the guest cancelling at least 24 hours before a daily or nightly stay
// (2 hours before an hourly one) returns everything paid. Later than that the owner keeps the first day, night or the
// minimum hours, and the rest goes back. The deposit always goes back in full and is counted separately.
export type CancelTerms={free:boolean;refund:number;withheld:number;deposit:number;freeUntil:number};
export const FREE_DAILY=24*3600,FREE_HOURLY=2*3600;
export function cancellationTerms(v:{by:'owner'|'guest';status:string;mode:string;rate:number;units:number;amount:number;paid:number;deposit:number;start:number;minHours:number;at:number}):CancelTerms{
 const hourly=v.mode==='hourly',freeUntil=v.start-(hourly?FREE_HOURLY:FREE_DAILY),paid=Math.max(0,Number(v.paid)||0),deposit=Math.max(0,Number(v.deposit)||0);
 const free=v.by==='owner'||v.status!=='confirmed'||v.at<=freeUntil;
 if(free)return {free:true,refund:paid,withheld:0,deposit,freeUntil};
 const first=hourly?v.rate*Math.max(1,Math.min(Number(v.units)||1,Number(v.minHours)||1)):v.mode==='legacy'?Math.round(v.amount/Math.max(1,Number(v.units)||1)):v.rate;
 const withheld=Math.min(paid,Math.max(0,first),v.amount);
 return {free:false,refund:paid-withheld,withheld,deposit,freeUntil};
}
// What the owner still has to return to the guest for a cancelled or expired booking (b.terms as the state gives them).
export function refundLeft(b:{terms?:{refund_recorded_at?:number|null;paid_amount?:number;refund_due?:number|null;refunded_amount?:number}|null}):number{
 const t=b.terms;if(!t||t.refund_recorded_at)return 0;const paid=Number(t.paid_amount)||0;
 return t.refund_due==null?paid:Math.max(0,Math.min(paid,Number(t.refund_due)-(Number(t.refunded_amount)||0)));
}
