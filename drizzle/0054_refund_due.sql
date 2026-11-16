-- After a cancellation: how much of the stay's payment the guest must have back in total (refunds made before the
-- cancellation count towards it), fixed at the moment of cancelling by the rules of the guest offer.
-- NULL keeps the old meaning: everything paid is to be returned.
ALTER TABLE booking_terms ADD COLUMN refund_due INTEGER;
-- The minimum hours agreed with the booking: a late cancellation of an hourly stay keeps this many hours,
-- whatever the owner sets for new requests afterwards. NULL (older bookings) falls back to the current policy.
ALTER TABLE booking_terms ADD COLUMN min_hours INTEGER;
