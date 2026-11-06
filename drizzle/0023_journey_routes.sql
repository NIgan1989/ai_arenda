ALTER TABLE journey_sessions ADD COLUMN route TEXT;
ALTER TABLE journey_sessions ADD COLUMN route_recorded_at INTEGER;
CREATE TRIGGER journey_route_erased AFTER UPDATE OF stopped_at,longitude,latitude ON journey_sessions
WHEN NEW.stopped_at IS NOT NULL OR NEW.longitude IS NULL OR NEW.latitude IS NULL
BEGIN UPDATE journey_sessions SET route=NULL,route_recorded_at=NULL WHERE id=NEW.id; END;
