-- Listing quality. The AI administrator compares a flat with similar flats in the same city that were
-- booked more often and names one difference: photos, an amenity, an hourly price, self check-in or
-- the description. One tip at a time; a missing amenity or an hourly price is set only by the owner's
-- button, the rest opens the listing editor.
CREATE TABLE listing_tips (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('photos','amenity','hourly','checkin','text')),
 subject TEXT NOT NULL DEFAULT '',
 mine INTEGER NOT NULL DEFAULT 0,
 theirs INTEGER NOT NULL DEFAULT 0,
 count INTEGER NOT NULL DEFAULT 0,
 leaders INTEGER NOT NULL DEFAULT 0,
 value INTEGER NOT NULL DEFAULT 0,
 details_version INTEGER,
 policy_version INTEGER,
 status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','declined','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 decided_at INTEGER
);
CREATE INDEX listing_tips_owner ON listing_tips(owner_id,status,created_at);
CREATE INDEX listing_tips_property ON listing_tips(property_id,kind,subject,status);
CREATE TRIGGER account_erased_listing_tips_insert BEFORE INSERT ON listing_tips WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_listing_tips_update BEFORE UPDATE ON listing_tips WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
