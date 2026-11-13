-- The AI administrator checks owner/flat and cleaner reviews by fixed rules. When every rule passes it
-- approves by itself; when the participant only has to add something it tells them and keeps the request
-- open; anything doubtful waits for the platform administrator with the reasons. ai_review=0 hands every
-- decision back to the administrator, the checks are still shown.
ALTER TABLE pilot_policy ADD COLUMN ai_review INTEGER NOT NULL DEFAULT 1 CHECK(ai_review IN (0,1));
ALTER TABLE participant_reviews ADD COLUMN ai_verdict TEXT NOT NULL DEFAULT '' CHECK(ai_verdict IN ('','approve','fix','escalate'));
ALTER TABLE participant_reviews ADD COLUMN ai_checks TEXT NOT NULL DEFAULT '[]';
ALTER TABLE participant_reviews ADD COLUMN ai_checked_at INTEGER;
