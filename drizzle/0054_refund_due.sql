-- What the guest is owed back after a cancellation, fixed at the moment of cancelling by the rules of the guest offer.
-- NULL keeps the old meaning: everything paid is to be returned.
ALTER TABLE booking_terms ADD COLUMN refund_due INTEGER;
