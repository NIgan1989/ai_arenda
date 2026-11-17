-- «Избранное» гостя (lib/favorites.ts): homes the guest marked with a heart. They come first in the guest's
-- search and their owners are asked first. The owner is not told; the row is the guest's own note.
CREATE TABLE guest_favorites (
 guest_id TEXT NOT NULL REFERENCES profiles(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(guest_id,property_id)
);
CREATE INDEX guest_favorites_property ON guest_favorites(property_id);
-- An erased account gets no new favourites (lib/account-deletion-inventory.ts).
CREATE TRIGGER account_erased_guest_favorites_insert BEFORE INSERT ON guest_favorites WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
