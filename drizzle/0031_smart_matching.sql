-- Preliminary availability enquiries never hold an apartment or create a booking.
CREATE TABLE matching_preferences (
 property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES profiles(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), updated_at INTEGER NOT NULL
);
CREATE TABLE matching_requests (
 id TEXT PRIMARY KEY, guest_id TEXT NOT NULL REFERENCES profiles(id), request_key TEXT NOT NULL,
 filters TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('searching','ready','booking','booked','empty','cancelled','expired')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, selected_offer TEXT, booking_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(guest_id,request_key)
);
CREATE TABLE matching_offers (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES matching_requests(id) ON DELETE CASCADE,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES profiles(id),
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','expired')), amount INTEGER NOT NULL, policy_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, responded_at INTEGER, UNIQUE(request_id,property_id)
);
CREATE INDEX matching_inbox ON matching_offers(owner_id,status,expires_at);
CREATE INDEX matching_guest ON matching_requests(guest_id,created_at);
CREATE TRIGGER account_erased_matching_preferences_insert BEFORE INSERT ON matching_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_matching_requests_insert BEFORE INSERT ON matching_requests WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_matching_offers_insert BEFORE INSERT ON matching_offers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_matching_preferences_update BEFORE UPDATE ON matching_preferences WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_matching_requests_update BEFORE UPDATE ON matching_requests WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_matching_offers_update BEFORE UPDATE ON matching_offers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
