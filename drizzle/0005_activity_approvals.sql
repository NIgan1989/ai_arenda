ALTER TABLE cleaning_jobs ADD COLUMN started_at INTEGER;
--> statement-breakpoint
ALTER TABLE cleaning_jobs ADD COLUMN submitted_at INTEGER;
--> statement-breakpoint
ALTER TABLE cleaning_jobs ADD COLUMN completed_at INTEGER;
--> statement-breakpoint
ALTER TABLE cleaning_jobs ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TRIGGER cleaning_job_revision AFTER UPDATE OF status,start,end,fee,assigned_to,checklist,report ON cleaning_jobs
BEGIN UPDATE cleaning_jobs SET version=OLD.version+1 WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER cleaning_job_started AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='in_progress' AND OLD.status='assigned'
BEGIN UPDATE cleaning_jobs SET started_at=COALESCE(started_at,unixepoch()) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER cleaning_job_submitted AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='submitted' AND OLD.status='in_progress'
BEGIN UPDATE cleaning_jobs SET submitted_at=unixepoch() WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER cleaning_job_completed AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='completed' AND OLD.status='submitted'
BEGIN UPDATE cleaning_jobs SET completed_at=unixepoch() WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER cleaning_job_revision_requested AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='in_progress' AND OLD.status='submitted'
BEGIN UPDATE cleaning_jobs SET submitted_at=NULL,completed_at=NULL WHERE id=NEW.id; END;
