// The result the owner pays the service for (2026-11-22): «заселение», a guest who came and settled in. One booking is
// one settling-in, however many days or hours it lasts. Nothing is owed for a booking that was cancelled, or before the
// guest came: the owner or the guest marked the arrival, the stay is over, or its end has passed without a cancellation.
// A booking that never happened is cancelled by the owner or closed as a no-show, and drops out by itself.
// Two cases around a dispute (audit of 2026-11-22):
// - the guest pressed «Меня не заселили» and the complaint is open: nothing is owed until a person decides, even if
//   the time of the booking has passed. When the complaint is closed and nobody marked the arrival, the stay watch
//   closes the booking as a no-show (lib/stay-watch.ts), and nothing is owed then either;
// - the owner cancelled after the guest said they had come in («Я заселился»): the guest's word stands, the
//   settling-in is owed; the owner disputes it with the platform (user agreement 6.8), a person decides.
export const CANCELLED_AFTER_ARRIVAL='booking.cancelled_after_arrival';
export const NOT_LET_IN_OPEN=(booking:string)=>`EXISTS(SELECT 1 FROM administrator_issues ni WHERE ni.entity_kind='booking' AND ni.entity_id=${booking} AND ni.status='open' AND ni.description LIKE 'Меня не заселили%')`;
export const stayedSql=(booking:string)=>`EXISTS(SELECT 1 FROM bookings sb LEFT JOIN booking_terms st ON st.booking_id=sb.id WHERE sb.id=${booking} AND NOT ${NOT_LET_IN_OPEN('sb.id')} AND (sb.status='completed' OR (sb.status='confirmed' AND (st.actual_checkin IS NOT NULL OR st.checkin_reported_at IS NOT NULL OR sb."end"<=CAST(strftime('%s','now') AS INTEGER))) OR (sb.status='cancelled' AND EXISTS(SELECT 1 FROM audit_events ae WHERE ae.entity_id=sb.id AND ae.action='${CANCELLED_AFTER_ARRIVAL}'))))`;
