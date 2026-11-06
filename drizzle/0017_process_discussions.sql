CREATE TABLE discussion_rooms (
 id TEXT PRIMARY KEY,entity_kind TEXT NOT NULL CHECK(entity_kind IN ('booking','job')),entity_id TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('stay','cleaning','shared')),membership_key TEXT NOT NULL,members TEXT NOT NULL,
 title TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(entity_kind,entity_id,channel,membership_key)
);
CREATE TABLE discussion_messages (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,room_id TEXT NOT NULL REFERENCES discussion_rooms(id),
 sender_id TEXT NOT NULL,sender_role TEXT NOT NULL CHECK(sender_role IN ('owner','guest','cleaner')),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),request_key TEXT NOT NULL,created_at INTEGER NOT NULL,
 UNIQUE(room_id,sender_id,sender_role,request_key)
);
CREATE INDEX discussion_messages_room ON discussion_messages(room_id,seq);
CREATE INDEX discussion_messages_sender ON discussion_messages(sender_id,created_at);
CREATE TRIGGER discussion_message_notification AFTER INSERT ON discussion_messages BEGIN
 INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at)
 SELECT lower(hex(randomblob(16))),json_extract(m.value,'$.id'),
 'Новое сообщение в обсуждении процесса. Откройте чат участников.',
 json_extract(m.value,'$.role')||':discussion:'||NEW.room_id||':'||NEW.seq,0,NEW.created_at
 FROM discussion_rooms r,json_each(r.members) m
 WHERE r.id=NEW.room_id AND json_extract(m.value,'$.id')<>NEW.sender_id;
END;
