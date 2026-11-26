-- Защита гостей от мошенников, шаг 2 (2026-11-26).
-- 1. Реквизиты владельца закрепляются в брони, когда она подтверждена. Если потом владелец их сменит, гость в карточке
--    брони видит красное предупреждение с прежними реквизитами (lib/payout.ts, payChange).
CREATE TABLE booking_payouts (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 phone TEXT NOT NULL,
 recipient TEXT NOT NULL,
 link TEXT NOT NULL DEFAULT '',
 locked_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO booking_payouts(booking_id,phone,recipient,link,locked_at)
 SELECT b.id,d.phone,d.recipient,d.link,unixepoch() FROM bookings b JOIN properties p ON p.id=b.property_id JOIN payout_details d ON d.user_id=p.owner_id
 WHERE b.status='confirmed' AND d.phone<>'';
CREATE TRIGGER booking_payout_lock AFTER UPDATE OF status ON bookings WHEN NEW.status='confirmed' AND OLD.status<>'confirmed' BEGIN
 INSERT OR IGNORE INTO booking_payouts(booking_id,phone,recipient,link,locked_at)
  SELECT NEW.id,d.phone,d.recipient,d.link,unixepoch() FROM properties p JOIN payout_details d ON d.user_id=p.owner_id WHERE p.id=NEW.property_id AND d.phone<>'';
END;
CREATE TRIGGER booking_payout_lock_insert AFTER INSERT ON bookings WHEN NEW.status='confirmed' BEGIN
 INSERT OR IGNORE INTO booking_payouts(booking_id,phone,recipient,link,locked_at)
  SELECT NEW.id,d.phone,d.recipient,d.link,unixepoch() FROM properties p JOIN payout_details d ON d.user_id=p.owner_id WHERE p.id=NEW.property_id AND d.phone<>'';
END;
-- An owner who confirmed before giving any details: the first details given are the ones fixed in those bookings.
CREATE TRIGGER booking_payout_first_insert AFTER INSERT ON payout_details WHEN NEW.phone<>'' BEGIN
 INSERT OR IGNORE INTO booking_payouts(booking_id,phone,recipient,link,locked_at)
  SELECT b.id,NEW.phone,NEW.recipient,NEW.link,unixepoch() FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=NEW.user_id AND b.status='confirmed';
END;
CREATE TRIGGER booking_payout_first_update AFTER UPDATE OF phone ON payout_details WHEN OLD.phone='' AND NEW.phone<>'' BEGIN
 INSERT OR IGNORE INTO booking_payouts(booking_id,phone,recipient,link,locked_at)
  SELECT b.id,NEW.phone,NEW.recipient,NEW.link,unixepoch() FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=NEW.user_id AND b.status='confirmed';
END;

-- 2. Отпечаток каждого фото жилья (lib/photo-print.ts): одно и то же фото у жилья разных владельцев видит администратор.
--    Пустой отпечаток: фото не прочиталось или однотонное, оно ни с чем не сравнивается.
CREATE TABLE media_prints (
 media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
 print TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX media_prints_created ON media_prints(created_at);
