CREATE TABLE property_details (
 property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
 details TEXT NOT NULL DEFAULT '{}', photos TEXT NOT NULL DEFAULT '[]',
 version INTEGER NOT NULL DEFAULT 1, revision TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE profile_details (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 avatar_id TEXT, work_status TEXT NOT NULL DEFAULT 'available',
 version INTEGER NOT NULL DEFAULT 1, revision TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE media (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('property','avatar')), data TEXT NOT NULL,
 width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX media_owner ON media(user_id,kind);
