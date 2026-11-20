import {prepayState} from './prepay';

// Completed stays of other people in this place: what earns it the right to take prepayments.
export const COMPLETED_STAYS_SQL="SELECT COUNT(*) n FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND b.status='completed' AND t.actual_checkout IS NOT NULL AND b.guest_id<>p.owner_id";
export async function completedStays(db:D1Database,propertyId:string){return Number((await db.prepare(COMPLETED_STAYS_SQL).bind(propertyId).first<{n:number}>())?.n)||0;}

export async function placePrepay(db:D1Database,propertyId:string,wanted:unknown){return prepayState(wanted,await completedStays(db,propertyId));}
