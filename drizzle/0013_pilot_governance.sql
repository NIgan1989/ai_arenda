CREATE TABLE pilot_policy (
 id TEXT PRIMARY KEY CHECK(id='global'),
 require_owner_review INTEGER NOT NULL DEFAULT 0 CHECK(require_owner_review IN (0,1)),
 require_cleaner_review INTEGER NOT NULL DEFAULT 0 CHECK(require_cleaner_review IN (0,1)),
 require_phone INTEGER NOT NULL DEFAULT 0 CHECK(require_phone IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO pilot_policy(id) VALUES ('global');

CREATE VIEW pilot_property_admissions AS
 SELECT p.id,p.owner_id,
 COALESCE((SELECT r.status='approved' AND (r.valid_until IS NULL OR r.valid_until>unixepoch())
  FROM participant_reviews r WHERE r.user_id=p.owner_id AND r.role='owner' AND r.property_id=p.id
  ORDER BY COALESCE(r.reviewed_at,r.created_at) DESC,r.created_at DESC,r.rowid DESC LIMIT 1),0) owner_reviewed,
 EXISTS(SELECT 1 FROM phone_verifications v WHERE v.user_id=p.owner_id AND v.verified_at IS NOT NULL) owner_phone_verified
 FROM properties p;
CREATE VIEW pilot_worker_admissions AS
 SELECT p.id,
 COALESCE((SELECT r.status='approved' AND (r.valid_until IS NULL OR r.valid_until>unixepoch())
  FROM participant_reviews r WHERE r.user_id=p.id AND r.role='cleaner' AND r.property_id IS NULL
  ORDER BY COALESCE(r.reviewed_at,r.created_at) DESC,r.created_at DESC,r.rowid DESC LIMIT 1),0) cleaner_reviewed,
 EXISTS(SELECT 1 FROM phone_verifications v WHERE v.user_id=p.id AND v.verified_at IS NOT NULL) phone_verified
 FROM profiles p;

CREATE TRIGGER pilot_property_publish_insert BEFORE INSERT ON properties WHEN NEW.published=1 AND NEW.demo_owner IS NULL BEGIN
 SELECT CASE WHEN (SELECT require_owner_review FROM pilot_policy WHERE id='global')=1
  THEN RAISE(ABORT,'pilot_owner_review_required') END;
 SELECT CASE WHEN (SELECT require_phone FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM phone_verifications WHERE user_id=NEW.owner_id AND verified_at IS NOT NULL)
  THEN RAISE(ABORT,'pilot_phone_required') END;
END;
CREATE TRIGGER pilot_property_publish_update BEFORE UPDATE OF published,owner_id ON properties WHEN NEW.published=1 AND NEW.demo_owner IS NULL BEGIN
 SELECT CASE WHEN (SELECT require_owner_review FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM pilot_property_admissions a WHERE a.id=NEW.id AND a.owner_id=NEW.owner_id AND a.owner_reviewed=1)
  THEN RAISE(ABORT,'pilot_owner_review_required') END;
 SELECT CASE WHEN (SELECT require_phone FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM phone_verifications WHERE user_id=NEW.owner_id AND verified_at IS NOT NULL)
  THEN RAISE(ABORT,'pilot_phone_required') END;
END;
CREATE TRIGGER pilot_booking_insert BEFORE INSERT ON bookings WHEN NEW.status IN ('requested','confirmed') AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL) BEGIN
 SELECT CASE WHEN (SELECT require_owner_review FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM pilot_property_admissions WHERE id=NEW.property_id AND owner_reviewed=1)
  THEN RAISE(ABORT,'pilot_owner_review_required') END;
 SELECT CASE WHEN (SELECT require_phone FROM pilot_policy WHERE id='global')=1 AND
  (NOT EXISTS(SELECT 1 FROM pilot_property_admissions WHERE id=NEW.property_id AND owner_phone_verified=1) OR NOT EXISTS(SELECT 1 FROM phone_verifications WHERE user_id=NEW.guest_id AND verified_at IS NOT NULL))
  THEN RAISE(ABORT,'pilot_phone_required') END;
END;
CREATE TRIGGER pilot_booking_update BEFORE UPDATE OF status,start,end ON bookings WHEN NEW.status IN ('requested','confirmed') AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL) BEGIN
 SELECT CASE WHEN (SELECT require_owner_review FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM pilot_property_admissions WHERE id=NEW.property_id AND owner_reviewed=1)
  THEN RAISE(ABORT,'pilot_owner_review_required') END;
 SELECT CASE WHEN (SELECT require_phone FROM pilot_policy WHERE id='global')=1 AND
  (NOT EXISTS(SELECT 1 FROM pilot_property_admissions WHERE id=NEW.property_id AND owner_phone_verified=1) OR NOT EXISTS(SELECT 1 FROM phone_verifications WHERE user_id=NEW.guest_id AND verified_at IS NOT NULL))
  THEN RAISE(ABORT,'pilot_phone_required') END;
END;
CREATE TRIGGER pilot_cleaner_assignment BEFORE UPDATE OF assigned_to ON cleaning_jobs WHEN NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to<>NEW.assigned_to) AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL) BEGIN
 SELECT CASE WHEN (SELECT require_cleaner_review FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM pilot_worker_admissions WHERE id=NEW.assigned_to AND cleaner_reviewed=1)
  THEN RAISE(ABORT,'pilot_cleaner_review_required') END;
 SELECT CASE WHEN (SELECT require_phone FROM pilot_policy WHERE id='global')=1 AND NOT EXISTS(SELECT 1 FROM pilot_worker_admissions WHERE id=NEW.assigned_to AND phone_verified=1)
  THEN RAISE(ABORT,'pilot_phone_required') END;
END;

CREATE TABLE operator_tickets (
 issue_id TEXT PRIMARY KEY REFERENCES administrator_issues(id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
 assigned_to TEXT REFERENCES profiles(id),deadline INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,resolved_at INTEGER
);
CREATE INDEX operator_tickets_queue ON operator_tickets(status,priority,deadline);
CREATE TABLE operator_history (
 id TEXT PRIMARY KEY,issue_id TEXT NOT NULL REFERENCES operator_tickets(issue_id),
 actor_id TEXT NOT NULL,actor_role TEXT NOT NULL CHECK(actor_role IN ('owner','guest','cleaner','platform_admin','system')),
 action TEXT NOT NULL,body TEXT NOT NULL,visibility TEXT NOT NULL DEFAULT 'participants' CHECK(visibility IN ('participants','operators')),
 created_at INTEGER NOT NULL
);
CREATE INDEX operator_history_issue ON operator_history(issue_id,created_at,id);
