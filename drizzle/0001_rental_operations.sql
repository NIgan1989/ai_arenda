CREATE TABLE property_policies (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 hourly_price INTEGER NOT NULL DEFAULT 0 CHECK(hourly_price>=0),
 min_hours INTEGER NOT NULL DEFAULT 2 CHECK(min_hours BETWEEN 1 AND 24),
 nightly_price INTEGER NOT NULL DEFAULT 0 CHECK(nightly_price>=0),
 checkin_minutes INTEGER NOT NULL DEFAULT 840 CHECK(checkin_minutes BETWEEN 0 AND 1439),
 checkout_minutes INTEGER NOT NULL DEFAULT 720 CHECK(checkout_minutes BETWEEN 0 AND 1439),
 deposit INTEGER NOT NULL DEFAULT 0 CHECK(deposit>=0),
 house_rules TEXT NOT NULL DEFAULT '',
 auto_confirm INTEGER NOT NULL DEFAULT 0 CHECK(auto_confirm IN (0,1)),
 cleaning_fee INTEGER NOT NULL DEFAULT 0 CHECK(cleaning_fee>=0),
 cleaning_budget INTEGER NOT NULL DEFAULT 0 CHECK(cleaning_budget>=cleaning_fee),
 version INTEGER NOT NULL DEFAULT 1,
 revision TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE property_operations (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 readiness TEXT NOT NULL DEFAULT 'inspection' CHECK(readiness IN ('ready','occupied','awaiting_cleaning','cleaning','inspection','maintenance','blocked')),
 active_booking_id TEXT REFERENCES bookings(id),
 version INTEGER NOT NULL DEFAULT 1,
 note TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO property_operations(property_id,updated_at) SELECT id,unixepoch() FROM properties;
--> statement-breakpoint
CREATE TABLE booking_terms (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 billing_mode TEXT NOT NULL CHECK(billing_mode IN ('daily','hourly','nightly','legacy')),
 rate INTEGER NOT NULL, units INTEGER NOT NULL, amount INTEGER NOT NULL,
 deposit INTEGER NOT NULL DEFAULT 0,
 deposit_status TEXT NOT NULL DEFAULT 'not_required' CHECK(deposit_status IN ('not_required','pending','owner_verified')),
 house_rules TEXT NOT NULL DEFAULT '', policy_version INTEGER NOT NULL DEFAULT 0,
 actual_checkin INTEGER, actual_checkout INTEGER, checkout_reported_at INTEGER
);
--> statement-breakpoint
INSERT INTO booking_terms(booking_id,billing_mode,rate,units,amount) SELECT id,'legacy',0,0,amount FROM bookings;
--> statement-breakpoint
CREATE TRIGGER cleaning_requires_vacancy BEFORE UPDATE OF status ON cleaning_jobs
WHEN NEW.status='in_progress' AND OLD.status<>'in_progress' BEGIN
 SELECT CASE WHEN NEW.booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND status='completed') THEN RAISE(ABORT,'checkout_required') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM property_operations WHERE property_id=NEW.property_id AND (active_booking_id IS NOT NULL OR readiness IN ('occupied','maintenance','blocked'))) THEN RAISE(ABORT,'property_not_vacant') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=NEW.property_id AND id<>NEW.id AND status IN ('in_progress','submitted')) THEN RAISE(ABORT,'property_cleaning_busy') END;
END;
