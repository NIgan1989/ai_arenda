CREATE TABLE review_property_bindings (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),revision INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE participant_reviews ADD COLUMN property_revision INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER review_bind_property_request AFTER INSERT ON participant_reviews
 WHEN NEW.role='owner' AND NEW.property_id IS NOT NULL BEGIN
 UPDATE participant_reviews SET property_revision=COALESCE((SELECT revision FROM review_property_bindings WHERE property_id=NEW.property_id),0) WHERE id=NEW.id;
END;
CREATE TRIGGER review_property_material_change AFTER UPDATE OF city,district,address,owner_id ON properties
 WHEN OLD.city<>NEW.city OR OLD.district<>NEW.district OR OLD.address<>NEW.address OR OLD.owner_id<>NEW.owner_id BEGIN
 INSERT INTO review_property_bindings(property_id,revision) VALUES (NEW.id,1)
 ON CONFLICT(property_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER review_reject_stale_approval BEFORE UPDATE OF status ON participant_reviews
 WHEN NEW.role='owner' AND NEW.property_id IS NOT NULL AND NEW.status='approved' BEGIN
 SELECT CASE WHEN NEW.property_revision<>COALESCE((SELECT revision FROM review_property_bindings WHERE property_id=NEW.property_id),0)
 OR NOT EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND owner_id=NEW.user_id)
 THEN RAISE(ABORT,'pilot_review_stale') END;
END;
DROP VIEW pilot_property_admissions;
CREATE VIEW pilot_property_admissions AS
 SELECT p.id,p.owner_id,
 COALESCE((SELECT r.status='approved' AND (r.valid_until IS NULL OR r.valid_until>unixepoch())
  FROM participant_reviews r WHERE r.user_id=p.owner_id AND r.role='owner' AND r.property_id=p.id
  AND r.property_revision=COALESCE((SELECT revision FROM review_property_bindings b WHERE b.property_id=p.id),0)
  ORDER BY COALESCE(r.reviewed_at,r.created_at) DESC,r.created_at DESC,r.rowid DESC LIMIT 1),0) owner_reviewed,
 EXISTS(SELECT 1 FROM phone_verifications v WHERE v.user_id=p.owner_id AND v.verified_at IS NOT NULL) owner_phone_verified
 FROM properties p;
