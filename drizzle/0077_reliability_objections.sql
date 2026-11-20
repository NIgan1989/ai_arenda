-- «Не согласен с оценкой»: a participant objects to the reliability rating the service computes about them
-- (lib/reliability-objection.ts). The Law «О персональных данных» art. 19-1 lets a person object to a decision made by
-- automated processing; the platform administrator answers within three working days. One open objection per role.
CREATE TABLE reliability_objections (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('guest','owner','cleaner')),
 body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered')),
 created_at INTEGER NOT NULL,
 due_at INTEGER NOT NULL,
 answer TEXT,
 answered_by TEXT,
 answered_at INTEGER
);
CREATE INDEX reliability_objections_user ON reliability_objections(user_id,role,created_at);
CREATE INDEX reliability_objections_open ON reliability_objections(status,due_at);
CREATE TRIGGER account_erased_reliability_objections_insert BEFORE INSERT ON reliability_objections WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_reliability_objections_update BEFORE UPDATE ON reliability_objections WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
