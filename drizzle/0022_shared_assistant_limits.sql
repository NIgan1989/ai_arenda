-- Shared hourly assistant request limits are also used by the native HTTP adapter,
-- whose account/session tables do not use migration 0007.
CREATE TABLE IF NOT EXISTS auth_attempt_limits (
 key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
