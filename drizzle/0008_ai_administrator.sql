ALTER TABLE property_policies ADD COLUMN auto_assign INTEGER NOT NULL DEFAULT 0 CHECK(auto_assign IN (0,1));
ALTER TABLE booking_terms ADD COLUMN deposit_returned_at INTEGER;
ALTER TABLE booking_terms ADD COLUMN refund_recorded_at INTEGER;
ALTER TABLE cleaning_jobs ADD COLUMN settled_at INTEGER;

CREATE TABLE administrator_runs (
 id TEXT PRIMARY KEY,
 token TEXT NOT NULL DEFAULT '',
 lease_until INTEGER NOT NULL DEFAULT 0,
 checked_at INTEGER NOT NULL DEFAULT 0,
 last_success INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '',
 cursor TEXT NOT NULL DEFAULT ''
);
CREATE TABLE administrator_tasks (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','guest','cleaner')),
 property_id TEXT NOT NULL REFERENCES properties(id),
 entity_kind TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 stage TEXT NOT NULL,
 title TEXT NOT NULL,
 reason TEXT NOT NULL,
 section TEXT NOT NULL,
 deadline INTEGER NOT NULL,
 priority INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 first_seen INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 resolved_at INTEGER,
 seen_run TEXT NOT NULL,
 last_notified INTEGER NOT NULL DEFAULT 0,
 notified_priority INTEGER NOT NULL DEFAULT 0,
 notice_revision INTEGER NOT NULL DEFAULT 0,
 notice_run TEXT NOT NULL DEFAULT ''
);
CREATE INDEX administrator_tasks_recipient ON administrator_tasks(user_id,role,status,priority,deadline);
CREATE INDEX administrator_tasks_owner ON administrator_tasks(owner_id,status);
CREATE TABLE administrator_issues (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 property_id TEXT NOT NULL REFERENCES properties(id),
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('booking','job')),
 entity_id TEXT NOT NULL,
 opened_by TEXT NOT NULL,
 opened_role TEXT NOT NULL CHECK(opened_role IN ('owner','guest','cleaner')),
 other_user TEXT NOT NULL,
 other_role TEXT NOT NULL CHECK(other_role IN ('owner','guest','cleaner')),
 description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 resolution TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 resolved_at INTEGER,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX administrator_issues_owner ON administrator_issues(owner_id,status);
