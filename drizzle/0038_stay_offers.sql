-- Late checkout and early check-in offered by the AI administrator when the guest asks in the booking chat.
-- The calendar and the cleaning are checked first and the price is the flat's current tariff for the moment.
-- The guest presses the button; under the owner's rules (mode «ИИ» with automatic extension) it applies at once,
-- otherwise the owner confirms it like any other change of the stay.
CREATE TABLE stay_offers (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 guest_id TEXT NOT NULL REFERENCES profiles(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('late','early')),
 start INTEGER NOT NULL,
 end INTEGER NOT NULL CHECK(end>start),
 hours INTEGER NOT NULL CHECK(hours BETWEEN 1 AND 12),
 amount INTEGER NOT NULL,
 extra INTEGER NOT NULL,
 billing_mode TEXT NOT NULL,
 base_version INTEGER NOT NULL,
 policy_version INTEGER NOT NULL,
 automatic INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','declined','expired')),
 change_id TEXT,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 decided_at INTEGER
);
CREATE INDEX stay_offers_guest ON stay_offers(guest_id,status,expires_at);
CREATE INDEX stay_offers_booking ON stay_offers(booking_id,status);
CREATE TRIGGER account_erased_stay_offers_insert BEFORE INSERT ON stay_offers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_stay_offers_update BEFORE UPDATE ON stay_offers WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
