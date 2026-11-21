-- «Удостоверение личности» (lib/identity-docs.ts): every participant attaches a photo of the ID card once, a person at
-- the platform compares it with the profile (and, for an owner, with the document of the right to let and the Kaspi
-- recipient). After the check the photo is deleted; the row stays as the record of the check (checked_at, checked_by).
CREATE TABLE identity_docs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 data TEXT NOT NULL DEFAULT '',
 object_key TEXT NOT NULL DEFAULT '',
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 checked_at INTEGER,
 checked_by TEXT
);
CREATE INDEX identity_docs_user ON identity_docs(user_id,created_at);
CREATE TRIGGER account_erased_identity_docs_insert BEFORE INSERT ON identity_docs WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
