-- Browser subscriptions belong to an authenticated session, never to a claimed user ID.
CREATE TABLE push_subscriptions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL REFERENCES auth_sessions(hash) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('guest','owner','cleaner')),
 endpoint_hash TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_test_at INTEGER NOT NULL DEFAULT 0,
 UNIQUE(session_hash,role), UNIQUE(endpoint_hash,role)
);
CREATE TABLE push_deliveries (
 id TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','dead')),
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT NOT NULL DEFAULT '',
 last_error TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 sent_at INTEGER,
 UNIQUE(subscription_id,notification_id)
);
CREATE INDEX push_due ON push_deliveries(status,available_at,lease_until);
CREATE TRIGGER notification_push AFTER INSERT ON notifications BEGIN
 INSERT OR IGNORE INTO push_deliveries(id,subscription_id,notification_id,available_at,created_at)
 SELECT lower(hex(randomblob(16))),s.id,NEW.id,NEW.created_at,NEW.created_at
 FROM push_subscriptions s JOIN auth_sessions a ON a.hash=s.session_hash AND a.user_id=s.user_id
 JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version
 WHERE s.user_id=NEW.user_id AND a.expires_at>unixepoch() AND NEW.dedupe LIKE s.role||':%';
END;
CREATE TRIGGER account_erased_push_subscriptions_insert BEFORE INSERT ON push_subscriptions
 WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_push_subscriptions_update BEFORE UPDATE ON push_subscriptions
 WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id)
 BEGIN SELECT RAISE(ABORT,'account_erased'); END;
