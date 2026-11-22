-- «Номера одного типа» (2026-11-22): a hotel, a hostel, an apart-hotel or a holiday resort has many rooms alike.
-- The owner fills one card («Стандарт двухместный») and says how many such rooms there are. Each room is an object
-- of its own underneath (its bookings, its calendar, its readiness), a copy of the lead card kept in step with it
-- (lib/room-units.ts); the guest sees one card with the count of free rooms, the owner one card with the count.
CREATE TABLE room_units (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 lead_id TEXT NOT NULL REFERENCES properties(id),
 created_at INTEGER NOT NULL,
 CHECK(property_id<>lead_id)
);
CREATE INDEX room_units_lead ON room_units(lead_id);
--> statement-breakpoint
-- A room of the type is admitted with its lead card: the owner's check of the place covers every room of it.
DROP VIEW pilot_property_admissions;
--> statement-breakpoint
CREATE VIEW pilot_property_admissions AS
 SELECT p.id,p.owner_id,
 COALESCE((SELECT r.status='approved' AND (r.valid_until IS NULL OR r.valid_until>unixepoch())
  FROM participant_reviews r WHERE r.user_id=p.owner_id AND r.role='owner' AND r.property_id=COALESCE((SELECT u.lead_id FROM room_units u WHERE u.property_id=p.id),p.id)
  AND r.property_revision=COALESCE((SELECT revision FROM review_property_bindings b WHERE b.property_id=COALESCE((SELECT u.lead_id FROM room_units u WHERE u.property_id=p.id),p.id)),0)
  ORDER BY COALESCE(r.reviewed_at,r.created_at) DESC,r.created_at DESC,r.rowid DESC LIMIT 1),0) owner_reviewed,
 EXISTS(SELECT 1 FROM phone_verifications v WHERE v.user_id=p.owner_id AND v.verified_at IS NOT NULL) owner_phone_verified
 FROM properties p;
