-- «Заведение» (lib/venue.ts): several halls of one place, each booked on its own. A hall is an object with its own
-- price, capacity and calendar; the venue only names what they share and keeps them together for the guest and the owner.
CREATE TABLE venues (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 title TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE venue_halls (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 venue_id TEXT NOT NULL REFERENCES venues(id),
 created_at INTEGER NOT NULL
);
CREATE INDEX venue_halls_venue ON venue_halls(venue_id);
-- An erased account does not get a venue again (lib/account-deletion-inventory.ts).
CREATE TRIGGER account_erased_venues_insert BEFORE INSERT ON venues WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
