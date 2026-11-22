-- Calls inside the app (2026-11-22): the participants of a chat talk by voice without seeing each other's number.
-- The voice goes through Cloudflare Realtime; this table only keeps who calls whom, the state and each side's
-- Realtime session. A side that stops answering for a while ends the call (seen_at), a ring ends after 45 seconds.
CREATE TABLE chat_calls (
 id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES discussion_rooms(id),
 caller_id TEXT NOT NULL,caller_role TEXT NOT NULL,callee_id TEXT NOT NULL,callee_role TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ringing','active','ended','missed','declined','cancelled')),
 caller_session TEXT NOT NULL DEFAULT '',callee_session TEXT NOT NULL DEFAULT '',
 caller_seen INTEGER NOT NULL,callee_seen INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,answered_at INTEGER,ended_at INTEGER
);
CREATE INDEX chat_calls_callee ON chat_calls(callee_id,status);
CREATE INDEX chat_calls_room ON chat_calls(room_id,status);
