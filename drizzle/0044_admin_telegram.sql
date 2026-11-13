-- Notices for the platform administrator (dedupe 'admin:...') belong to no workspace role, so the
-- role-matched outbox trigger skipped them and they never left the admin page. They now go to the
-- administrator's own linked Telegram chat, whichever role linked it.
CREATE TRIGGER notification_outbox_admin AFTER INSERT ON notifications WHEN NEW.dedupe LIKE 'admin:%' BEGIN
 INSERT OR IGNORE INTO delivery_outbox(id,notification_id,user_id,role,channel,available_at,created_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.user_id,c.role,'telegram',NEW.created_at,NEW.created_at FROM delivery_channels c
 WHERE c.user_id=NEW.user_id AND c.channel='telegram' AND c.enabled=1 AND c.verified_at IS NOT NULL
 ORDER BY CASE c.role WHEN 'owner' THEN 0 WHEN 'guest' THEN 1 ELSE 2 END LIMIT 1;
END;
