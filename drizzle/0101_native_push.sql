-- Push to the phone app (audit «Доставка срочных уведомлений», point 4): the app's own token, bound to its signed-in
-- session and role like a browser subscription (0030_web_push.sql). Delivery goes through the Expo push service, which
-- hands it to Firebase (Android) and Apple (iPhone) once their keys are set in EAS.
CREATE TABLE native_push_devices (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL REFERENCES auth_mobile_sessions(hash) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('guest','owner','cleaner')),
 platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
 token_hash TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_test_at INTEGER NOT NULL DEFAULT 0,
 UNIQUE(session_hash,role), UNIQUE(token_hash,role)
);
CREATE TABLE native_push_deliveries (
 id TEXT PRIMARY KEY,
 device_id TEXT NOT NULL REFERENCES native_push_devices(id) ON DELETE CASCADE,
 notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','dead')),
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT NOT NULL DEFAULT '',
 last_error TEXT NOT NULL DEFAULT '',
 ticket TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 sent_at INTEGER,
 UNIQUE(device_id,notification_id)
);
CREATE INDEX native_push_due ON native_push_deliveries(status,available_at,lease_until);
CREATE INDEX native_push_tickets ON native_push_deliveries(status,ticket,sent_at);
CREATE TRIGGER notification_native_push AFTER INSERT ON notifications BEGIN
 INSERT OR IGNORE INTO native_push_deliveries(id,device_id,notification_id,available_at,created_at)
 SELECT lower(hex(randomblob(16))),d.id,NEW.id,NEW.created_at,NEW.created_at
 FROM native_push_devices d JOIN auth_mobile_sessions a ON a.hash=d.session_hash AND a.user_id=d.user_id
 JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version
 WHERE d.user_id=NEW.user_id AND a.expires_at>unixepoch() AND NEW.dedupe LIKE d.role||':%';
END;
CREATE TRIGGER account_erased_native_push_devices_insert BEFORE INSERT ON native_push_devices WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_native_push_devices_update BEFORE UPDATE ON native_push_devices WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
