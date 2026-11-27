-- «Гарантия заселения» (2026-11-27). The guest at the door says «Не получается заселиться» with a reason. The owner is
-- called at once (the report is «Меня не заселили», lib/account-restrictions.ts). Ten minutes later, if nobody let the
-- guest in, the guest sees two or three free places nearby, no dearer, that confirm a booking at once; picking one
-- books it and cancels the first booking by the owner's terms, a full refund that the owner makes (lib/checkin-guarantee.ts).
-- The guest is the booking's guest, so the row names no person: it stays with the booking's history.
CREATE TABLE IF NOT EXISTS checkin_guarantees (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 reason TEXT NOT NULL CHECK(reason IN ('no_answer','key','not_as_photo','other')),
 reported_at INTEGER NOT NULL,
 replaced_by TEXT REFERENCES bookings(id),
 replaced_at INTEGER,
 -- A replacement being booked right now (one choice at a time; a stale hold frees itself after a minute).
 switching_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS checkin_guarantees_replacement ON checkin_guarantees(replaced_by) WHERE replaced_by IS NOT NULL;
