-- A booking change may carry a new number of guests, priced and checked against the capacity (audit 2026-11-22).
ALTER TABLE booking_changes ADD COLUMN guests INTEGER CHECK(guests IS NULL OR guests>0);
