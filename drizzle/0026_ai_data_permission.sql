CREATE TABLE ai_data_permissions (
 user_id TEXT PRIMARY KEY,
 allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
 policy_version TEXT NOT NULL,
 version INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE ai_data_permission_events (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
 policy_version TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(user_id,version)
);
CREATE TABLE administrator_search_results (
 message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
 result TEXT NOT NULL
);
