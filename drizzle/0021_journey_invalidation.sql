CREATE TRIGGER journey_booking_revoked AFTER UPDATE OF status,guest_id ON bookings
WHEN NEW.status<>'confirmed' OR OLD.guest_id<>NEW.guest_id
BEGIN UPDATE journey_sessions SET stopped_at=CAST(strftime('%s','now') AS INTEGER),longitude=NULL,latitude=NULL,accuracy=NULL WHERE entity_kind='booking' AND entity_id=NEW.id AND stopped_at IS NULL; END;
CREATE TRIGGER journey_checkin_finished AFTER UPDATE OF actual_checkin,actual_checkout ON booking_terms
WHEN NEW.actual_checkin IS NOT NULL OR NEW.actual_checkout IS NOT NULL
BEGIN UPDATE journey_sessions SET stopped_at=CAST(strftime('%s','now') AS INTEGER),longitude=NULL,latitude=NULL,accuracy=NULL WHERE entity_kind='booking' AND entity_id=NEW.booking_id AND stopped_at IS NULL; END;
CREATE TRIGGER journey_assignment_revoked AFTER UPDATE OF assigned_to,status,owner_id ON cleaning_jobs
WHEN NEW.status<>'assigned' OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.owner_id<>NEW.owner_id
BEGIN UPDATE journey_sessions SET stopped_at=CAST(strftime('%s','now') AS INTEGER),longitude=NULL,latitude=NULL,accuracy=NULL WHERE entity_kind='job' AND entity_id=NEW.id AND stopped_at IS NULL; END;
CREATE TRIGGER journey_owner_changed AFTER UPDATE OF owner_id ON properties
WHEN OLD.owner_id<>NEW.owner_id
BEGIN UPDATE journey_sessions SET stopped_at=CAST(strftime('%s','now') AS INTEGER),longitude=NULL,latitude=NULL,accuracy=NULL WHERE stopped_at IS NULL AND ((entity_kind='booking' AND entity_id IN (SELECT id FROM bookings WHERE property_id=NEW.id)) OR (entity_kind='job' AND entity_id IN (SELECT id FROM cleaning_jobs WHERE property_id=NEW.id))); END;
