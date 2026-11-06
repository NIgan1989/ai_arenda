CREATE TABLE auth_mobile_sessions (
 hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 credential_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_mobile_sessions_user ON auth_mobile_sessions(user_id);
CREATE INDEX auth_mobile_sessions_expiry ON auth_mobile_sessions(expires_at);
CREATE TABLE client_conversations (
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('guest','owner','cleaner')),
 body TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role)
);
