// The guest rates a completed stay once, within 14 days after checkout (lib/stay-reviews.ts checks it on the server).
// Pure logic, shared with the app: after the term the card says so instead of offering the stars (audit 2026-11-22).
export const REVIEW_ASK_AFTER=3600,REVIEW_WINDOW=14*86400;
type Row={status?:unknown;review_rating?:unknown;actual_checkout?:unknown;terms?:{actual_checkout?:unknown}|null};
/** The checkout the term counts from: the booking's own row on the server, its terms in the app. */
const checkoutOf=(b:Row)=>Number(b.actual_checkout??b.terms?.actual_checkout)||0;
/** The last moment the stay can still be rated, or 0 before the checkout is confirmed. */
export const reviewUntil=(b:Row)=>{const out=checkoutOf(b);return out?out+REVIEW_WINDOW:0;};
/** A completed stay without a rating whose term is still open. */
export const canRate=(b:Row|null|undefined,now:number)=>!!b&&b.status==='completed'&&!b.review_rating&&reviewUntil(b)>=now;
/** A completed stay without a rating whose term has passed. Without a known checkout nothing is said: the term counts
 *  from it, and «срок прошёл» the day after a stay misled the guest (board of old screens, 2026-11-26). */
export const rateClosed=(b:Row|null|undefined,now:number)=>!!b&&b.status==='completed'&&!b.review_rating&&reviewUntil(b)>0&&reviewUntil(b)<now;
