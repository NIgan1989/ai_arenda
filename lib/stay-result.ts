// The result the owner pays the service for (2026-11-22): «заселение», a guest who came and settled in. One booking is
// one settling-in, however many days or hours it lasts. Nothing is owed for a booking that was cancelled, or before the
// guest came: the owner or the guest marked the arrival, the stay is over, or its end has passed without a cancellation.
// A booking that never happened is cancelled by «Меня не заселили» or by the owner, and drops out by itself.
export const stayedSql=(booking:string)=>`EXISTS(SELECT 1 FROM bookings sb LEFT JOIN booking_terms st ON st.booking_id=sb.id WHERE sb.id=${booking} AND (sb.status='completed' OR (sb.status='confirmed' AND (st.actual_checkin IS NOT NULL OR st.checkin_reported_at IS NOT NULL OR sb."end"<=CAST(strftime('%s','now') AS INTEGER)))))`;
