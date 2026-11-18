-- Отметки «Выезжаю» и «Я на месте» принадлежат назначенному исполнителю: когда уборка возвращается в поиск
-- или переходит к другому (отказ, замена, перенос), они стираются, откуда бы ни пришла смена исполнителя.
CREATE TRIGGER cleaning_job_arrival_reset AFTER UPDATE OF assigned_to ON cleaning_jobs
WHEN NEW.assigned_to IS NOT OLD.assigned_to AND (NEW.on_way_at IS NOT NULL OR NEW.arrived_at IS NOT NULL)
BEGIN UPDATE cleaning_jobs SET on_way_at=NULL,arrived_at=NULL WHERE id=NEW.id; END;
