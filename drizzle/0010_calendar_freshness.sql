CREATE TRIGGER booking_calendar_freshness_insert BEFORE INSERT ON bookings WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM calendar_sources WHERE property_id=NEW.property_id AND enabled=1 AND url<>'' AND (last_success IS NULL OR last_success<unixepoch()-3600 OR last_error<>'')) THEN RAISE(ABORT,'external_calendar_stale') END;
END;
CREATE TRIGGER booking_calendar_freshness_update BEFORE UPDATE OF start,end,occupied_until,status ON bookings WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM calendar_sources WHERE property_id=NEW.property_id AND enabled=1 AND url<>'' AND (last_success IS NULL OR last_success<unixepoch()-3600 OR last_error<>'')) THEN RAISE(ABORT,'external_calendar_stale') END;
END;
