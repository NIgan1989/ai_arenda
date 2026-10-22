CREATE TABLE assistant_preferences (
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('guest','owner','cleaner')),
 settings TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role)
);
