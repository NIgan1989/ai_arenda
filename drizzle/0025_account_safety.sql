CREATE TABLE deletion_requests (
 user_id TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, requested_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','cancelled')), reason TEXT NOT NULL DEFAULT ''
);
CREATE TABLE content_reports (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,role TEXT NOT NULL,target_kind TEXT NOT NULL CHECK(target_kind IN ('message','ai')),
 target_id TEXT NOT NULL,room_id TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL,created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),resolution TEXT NOT NULL DEFAULT '',
 UNIQUE(user_id,role,target_kind,target_id,room_id)
);
CREATE INDEX content_reports_queue ON content_reports(status,created_at);
CREATE TABLE discussion_blocks (
 room_id TEXT NOT NULL,blocker_id TEXT NOT NULL,blocker_role TEXT NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(room_id,blocker_id,blocker_role)
);
