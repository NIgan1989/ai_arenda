-- The part of a received deposit the owner keeps for damage after the stay, with the reason the guest sees.
-- The rest is what the owner still returns; a deposit kept in full needs no return.
ALTER TABLE booking_terms ADD COLUMN deposit_kept INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking_terms ADD COLUMN deposit_kept_note TEXT NOT NULL DEFAULT '';
