-- A booking of one's own home (possible before the service forbade it) owes no refund to anybody:
-- the closed ones stop asking the owner to «return the payment» to themselves.
UPDATE booking_terms SET refund_due=COALESCE(refund_due,0),refund_recorded_at=unixepoch()
 WHERE refund_recorded_at IS NULL AND booking_id IN (SELECT b.id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=p.owner_id AND b.status IN ('cancelled','expired'));
