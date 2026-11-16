-- A shown flat whose address changed waits for a new check and is hidden from new guests meanwhile.
-- Bookings made before the change must not freeze: confirming them and moving their dates keeps working
-- while the flat was approved before and the new address has not been refused.
DROP TRIGGER pilot_booking_update;
CREATE TRIGGER pilot_booking_update BEFORE UPDATE OF status,start,end ON bookings WHEN NEW.status IN ('requested','confirmed') AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL) BEGIN
 SELECT CASE WHEN (SELECT require_owner_review FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM pilot_property_admissions WHERE id=NEW.property_id AND owner_reviewed=1)
  AND NOT (EXISTS(SELECT 1 FROM participant_reviews r JOIN properties p ON p.id=r.property_id AND p.owner_id=r.user_id WHERE r.property_id=NEW.property_id AND r.role='owner' AND r.status='approved' AND (r.valid_until IS NULL OR r.valid_until>unixepoch())
    AND r.property_revision<COALESCE((SELECT revision FROM review_property_bindings b WHERE b.property_id=r.property_id),0))
   AND NOT EXISTS(SELECT 1 FROM participant_reviews r WHERE r.property_id=NEW.property_id AND r.role='owner' AND r.status='rejected'
    AND r.property_revision=COALESCE((SELECT revision FROM review_property_bindings b WHERE b.property_id=r.property_id),0)))
  THEN RAISE(ABORT,'pilot_owner_review_required') END;
 SELECT CASE WHEN (SELECT require_phone FROM pilot_policy WHERE id='global')=1 AND
  (NOT EXISTS(SELECT 1 FROM pilot_property_admissions WHERE id=NEW.property_id AND owner_phone_verified=1) OR NOT EXISTS(SELECT 1 FROM phone_verifications WHERE user_id=NEW.guest_id AND verified_at IS NOT NULL))
  THEN RAISE(ABORT,'pilot_phone_required') END;
END;
