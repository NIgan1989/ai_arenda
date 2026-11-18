-- While a guest is let in early, the time from that moment to the agreed arrival is theirs: no other booking may take it.
CREATE TRIGGER booking_early_checkin_insert_guard BEFORE INSERT ON bookings
WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings e JOIN booking_terms t ON t.booking_id=e.id WHERE e.property_id=NEW.property_id AND e.id<>NEW.id AND e.status='confirmed' AND t.early_checkin_at IS NOT NULL AND t.actual_checkout IS NULL AND t.early_checkin_at<NEW.occupied_until AND e.start>NEW.start) THEN RAISE(ABORT,'booking_overlap') END;
END;
CREATE TRIGGER booking_early_checkin_update_guard BEFORE UPDATE OF start,end,occupied_until,status ON bookings
WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings e JOIN booking_terms t ON t.booking_id=e.id WHERE e.property_id=NEW.property_id AND e.id<>NEW.id AND e.status='confirmed' AND t.early_checkin_at IS NOT NULL AND t.actual_checkout IS NULL AND t.early_checkin_at<NEW.occupied_until AND e.start>NEW.start) THEN RAISE(ABORT,'booking_overlap') END;
END;
