CREATE TABLE moderated_content (
 kind TEXT NOT NULL CHECK(kind IN ('message','ai')),
 target_id TEXT NOT NULL,
 room_id TEXT NOT NULL DEFAULT '',
 original_body TEXT NOT NULL,
 original_photo_data TEXT NOT NULL DEFAULT '',
 original_search_result TEXT,
 hidden INTEGER NOT NULL CHECK(hidden IN (0,1)),
 version INTEGER NOT NULL,
 operation_key TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(kind,target_id,room_id)
);
CREATE TABLE moderation_access_events (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 report_id TEXT NOT NULL REFERENCES content_reports(id),
 action TEXT NOT NULL,
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX moderation_access_report ON moderation_access_events(report_id,created_at);
