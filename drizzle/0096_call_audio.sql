-- Calls inside the app, audit 2026-11-22: a call counts from the moment the voice is connected on both sides, not
-- from «Принять»; a call without voice ends as «Связь не установлена». A call that rings for nobody is ended by the
-- server itself (once a minute), and a call whose booking or cleaning is no longer active ends with the reason.
ALTER TABLE chat_calls ADD COLUMN caller_audio INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_calls ADD COLUMN callee_audio INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_calls ADD COLUMN end_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX chat_calls_live ON chat_calls(status,created_at);
