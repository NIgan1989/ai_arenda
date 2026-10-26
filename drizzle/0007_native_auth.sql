CREATE TABLE IF NOT EXISTS auth_accounts (
 id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
 credential_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 credential_version INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempt_limits (
 key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
