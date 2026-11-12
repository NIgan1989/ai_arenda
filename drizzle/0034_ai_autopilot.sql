-- A flat under the AI administrator's autopilot («ИИ») pays its own commission rate:
-- the service does the owner's routine there. Each commission records whether the
-- flat was under autopilot when the booking was confirmed.
ALTER TABLE platform_billing ADD COLUMN ai_rate_bp INTEGER NOT NULL DEFAULT 1000 CHECK(ai_rate_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_commissions ADD COLUMN managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0,1));
CREATE INDEX platform_commissions_managed ON platform_commissions(managed,created_at);
-- After checkout the AI administrator asks the guest to rate the stay. One rating per
-- completed booking; the text is shown only to the owner, the average to everyone.
CREATE TABLE stay_reviews (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 guest_id TEXT NOT NULL REFERENCES profiles(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=1000),
 created_at INTEGER NOT NULL
);
CREATE INDEX stay_reviews_property ON stay_reviews(property_id,created_at);
CREATE TRIGGER account_erased_stay_reviews_insert BEFORE INSERT ON stay_reviews WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
-- The guest says they have arrived; under autopilot the AI confirms the check-in once the
-- payment and the deposit are verified.
ALTER TABLE booking_terms ADD COLUMN checkin_reported_at INTEGER;
