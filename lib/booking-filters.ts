// «Мои брони» in the app in three tabs: what is still going on, what has ended, what was cancelled.
// A finished or cancelled booking where the owner still owes the guest money (a refund or the deposit)
// stays among the active ones for the owner, so the button «Вернул …» is not lost in the archive.
import {refundLeft} from './cancellation';
type Row=Record<string,any>;
export type BookingTab='active'|'done'|'cancelled';
export const bookingTabs:{id:BookingTab;label:string}[]=[{id:'active',label:'Активные'},{id:'done',label:'Завершённые'},{id:'cancelled',label:'Отменённые'}];
export function bookingTab(b:Row,role:string,userId:string):BookingTab{
 if(['requested','confirmed'].includes(b.status))return 'active';
 const owner=role==='owner'&&b.owner_id===userId,closed=['cancelled','expired','rejected'].includes(b.status);
 const owes=owner&&((closed&&refundLeft(b)>0)||(['completed','cancelled','expired'].includes(b.status)&&b.terms?.deposit_status==='owner_verified'&&Number(b.terms?.deposit_balance)>0));
 if(owes)return 'active';
 return closed?'cancelled':'done';
}
// How many bookings each tab holds, and the tab to open first: the active one, or else the first that is not empty.
export function bookingTabCounts(items:Row[],role:string,userId:string):Record<BookingTab,number>{
 const counts:Record<BookingTab,number>={active:0,done:0,cancelled:0};
 for(const b of items)counts[bookingTab(b,role,userId)]++;
 return counts;
}
export function firstBookingTab(counts:Record<BookingTab,number>):BookingTab{
 return counts.active?'active':counts.done?'done':counts.cancelled?'cancelled':'active';
}

// The owner's «Заявки» in the app (2026-11-18): what waits for his answer, what is booked, and the archive.
// «Новые»: a guest's request still open (its answer time has not passed). Cleaners' responses are counted there too (App.tsx).
// «Брони»: confirmed stays, and ended ones where he still owes the guest money (same rule as bookingTab).
// «Архив»: everything that has ended — stayed, cancelled, refused or left without an answer.
export type OwnerRequestTab='new'|'booked'|'archive';
export const ownerRequestTabs:{id:OwnerRequestTab;label:string}[]=[{id:'new',label:'Новые'},{id:'booked',label:'Брони'},{id:'archive',label:'Архив'}];
export function ownerRequestTab(b:Row,userId:string,now:number):OwnerRequestTab{
 if(b.status==='requested')return Number(b.expires_at)>now?'new':'archive';
 return bookingTab(b,'owner',userId)==='active'?'booked':'archive';
}
