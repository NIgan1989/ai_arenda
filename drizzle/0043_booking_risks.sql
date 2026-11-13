-- Booking risk: when a guest sends a request the AI administrator scores it from the
-- guest's history (verified phone, past stays, disputes at checkout, cancellations) and
-- the request itself (last minute, hourly at night). The owner sees the level, the
-- reasons and a refundable deposit to ask for. Under autopilot a high risk is not
-- confirmed automatically (held=1) and goes to the owner.
CREATE TABLE booking_risks (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 guest_id TEXT NOT NULL REFERENCES profiles(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 level TEXT NOT NULL CHECK(level IN ('low','medium','high')),
 score INTEGER NOT NULL,
 reasons TEXT NOT NULL DEFAULT '[]' CHECK(length(reasons)<=2000),
 deposit_advice INTEGER NOT NULL DEFAULT 0 CHECK(deposit_advice>=0),
 phone_verified INTEGER NOT NULL DEFAULT 0 CHECK(phone_verified IN (0,1)),
 held INTEGER NOT NULL DEFAULT 0 CHECK(held IN (0,1)),
 created_at INTEGER NOT NULL
);
CREATE INDEX booking_risks_owner ON booking_risks(owner_id,created_at);
CREATE INDEX booking_risks_guest ON booking_risks(guest_id,created_at);
CREATE TRIGGER account_erased_booking_risks_insert BEFORE INSERT ON booking_risks WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.guest_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
