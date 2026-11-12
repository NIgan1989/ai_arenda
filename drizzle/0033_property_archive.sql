-- An owner can remove a flat. A flat without any history is deleted outright;
-- one with bookings, cleanings or money records is archived instead: hidden from
-- guests and from the owner's lists, while its history stays for both sides.
ALTER TABLE properties ADD COLUMN archived_at INTEGER;
CREATE TRIGGER property_archived_hidden BEFORE UPDATE OF published ON properties
WHEN NEW.archived_at IS NOT NULL AND NEW.published=1
BEGIN SELECT RAISE(ABORT,'property_archived'); END;
