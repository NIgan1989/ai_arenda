-- How far the AI administrator has gone with an overdue cleaning: 1 reminded both sides, 2 no answer for
-- 30 minutes, 3 handed to the service administrator. Extending the deadline starts it over.
ALTER TABLE cleaning_jobs ADD COLUMN overdue_step INTEGER NOT NULL DEFAULT 0;
