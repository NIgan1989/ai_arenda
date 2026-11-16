-- A flat used to stay «Ожидает проверки» after the platform approved it, and a guest could not move in until the owner
-- found the readiness form. Approved flats that the owner never marked by hand and that are not mid-cleaning are ready.
UPDATE property_operations SET readiness='ready',version=version+1,updated_at=unixepoch()
WHERE readiness='inspection' AND active_booking_id IS NULL
 AND EXISTS(SELECT 1 FROM properties p WHERE p.id=property_operations.property_id AND p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL)
 AND NOT EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.property_id=property_operations.property_id AND j.status IN ('in_progress','submitted'))
 AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_id=property_operations.property_id AND a.action LIKE '%property.readiness_requested%');
