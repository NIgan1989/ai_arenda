ALTER TABLE property_policies ADD COLUMN max_discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(max_discount_percent BETWEEN 0 AND 50);
--> statement-breakpoint
ALTER TABLE property_policies ADD COLUMN minimum_rate INTEGER NOT NULL DEFAULT 0 CHECK(minimum_rate>=0);
--> statement-breakpoint
ALTER TABLE property_policies ADD COLUMN repair_budget INTEGER NOT NULL DEFAULT 0 CHECK(repair_budget>=0);
--> statement-breakpoint
ALTER TABLE property_policies ADD COLUMN auto_extension INTEGER NOT NULL DEFAULT 0 CHECK(auto_extension IN (0,1));
--> statement-breakpoint
ALTER TABLE property_policies ADD COLUMN max_extension_hours INTEGER NOT NULL DEFAULT 0 CHECK(max_extension_hours BETWEEN 0 AND 168);
--> statement-breakpoint
ALTER TABLE property_policies ADD COLUMN mandate_until INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE property_policies ADD COLUMN escalation_contact TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE booking_terms ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE booking_terms ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE booking_terms ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE booking_terms ADD COLUMN original_end INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE booking_terms SET original_end=(SELECT end FROM bookings WHERE id=booking_id);
--> statement-breakpoint
UPDATE booking_terms SET paid_amount=amount WHERE booking_id IN (SELECT id FROM bookings WHERE payment_status='owner_verified');
--> statement-breakpoint
CREATE TABLE booking_changes (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id),
 proposed_by TEXT NOT NULL, proposer_role TEXT NOT NULL CHECK(proposer_role IN ('owner','guest')),
 request_key TEXT NOT NULL, base_version INTEGER NOT NULL, policy_version INTEGER NOT NULL,
 start INTEGER NOT NULL, end INTEGER NOT NULL, occupied_until INTEGER NOT NULL,
 billing_mode TEXT NOT NULL, rate INTEGER NOT NULL, units INTEGER NOT NULL,
 discount_percent INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0),
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER,
 UNIQUE(proposed_by,request_key)
);
--> statement-breakpoint
CREATE INDEX booking_changes_pending ON booking_changes(booking_id,status,expires_at);
--> statement-breakpoint
CREATE TRIGGER booking_update_cleaning_guard BEFORE UPDATE OF start,end,occupied_until,status ON bookings
WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.property_id=NEW.property_id AND j.status IN ('open','assigned','in_progress','submitted') AND (j.booking_id IS NULL OR j.booking_id<>NEW.id) AND j.start<NEW.occupied_until AND j.end>NEW.start) THEN RAISE(ABORT,'booking_overlap') END;
END;
