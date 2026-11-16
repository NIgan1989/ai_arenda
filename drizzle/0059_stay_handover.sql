-- «Как гость оставил жильё?» (lib/stay-handover.ts): after checkout the owner hands the home over once,
-- all good (ok) or with issues from a fixed list (issues, a JSON array of codes) and photos. note goes only
-- to the guest of this stay. cleaner_photos: how many photos the executor took before cleaning or of damage
-- at the moment of the handover. Stage 1: seen only by this owner and this guest.
CREATE TABLE stay_handovers (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 guest_id TEXT NOT NULL REFERENCES profiles(id),
 verdict TEXT NOT NULL CHECK(verdict IN ('ok','issues')),
 issues TEXT NOT NULL DEFAULT '[]',
 note TEXT NOT NULL DEFAULT '',
 cleaner_photos INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX stay_handovers_guest ON stay_handovers(guest_id,created_at);
-- Photos of the home taken during a stay: by the guest right after moving in (checkin), by the owner at the handover
-- (handover). Only the guest and the owner of that stay see them. The picture is in R2 (object_key) or inline (data).
CREATE TABLE stay_photos (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 user_id TEXT NOT NULL REFERENCES profiles(id),
 phase TEXT NOT NULL CHECK(phase IN ('checkin','handover')),
 data TEXT NOT NULL DEFAULT '',
 object_key TEXT NOT NULL DEFAULT '',
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX stay_photos_booking ON stay_photos(booking_id,phase,created_at);
-- An erased account gets no new handovers or stay photos (lib/account-deletion-inventory.ts).
CREATE TRIGGER account_erased_stay_handovers_insert BEFORE INSERT ON stay_handovers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_stay_photos_insert BEFORE INSERT ON stay_photos WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
