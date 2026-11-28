-- «Гость ещё здесь» (2026-11-28). The performer never decides that the guest has left: the owner or the owner's
-- autopilot confirms the checkout, and the performer gets the signal «Можно начинать». At the door the performer only
-- says what they see: «Я на месте» (arrived_at) or «Гость ещё здесь» (guest_here_at). The owner then chooses: wait
-- half an hour, or let the performer go. Like the arrival marks, it belongs to the assigned performer.
ALTER TABLE cleaning_jobs ADD COLUMN guest_here_at integer;
DROP TRIGGER IF EXISTS cleaning_job_arrival_reset;
CREATE TRIGGER cleaning_job_arrival_reset AFTER UPDATE OF assigned_to ON cleaning_jobs
WHEN NEW.assigned_to IS NOT OLD.assigned_to AND (NEW.on_way_at IS NOT NULL OR NEW.arrived_at IS NOT NULL OR NEW.guest_here_at IS NOT NULL)
BEGIN UPDATE cleaning_jobs SET on_way_at=NULL,arrived_at=NULL,guest_here_at=NULL WHERE id=NEW.id; END;
