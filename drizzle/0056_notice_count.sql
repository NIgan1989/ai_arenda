-- How many reminders about the same matter were sent since it opened: the AI administrator stops after a few
-- instead of repeating every hour without end. Matters already repeated many times count as reminded in full.
ALTER TABLE administrator_tasks ADD COLUMN notice_count INTEGER NOT NULL DEFAULT 0;
UPDATE administrator_tasks SET notice_count=notice_revision;
