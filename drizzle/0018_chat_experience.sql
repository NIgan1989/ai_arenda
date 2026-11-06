ALTER TABLE discussion_messages ADD COLUMN photo_data TEXT NOT NULL DEFAULT '';
ALTER TABLE discussion_messages ADD COLUMN reply_to INTEGER REFERENCES discussion_messages(seq);
CREATE TABLE discussion_visits (
 room_id TEXT NOT NULL REFERENCES discussion_rooms(id),user_id TEXT NOT NULL,role TEXT NOT NULL,
 last_seq INTEGER NOT NULL DEFAULT 0,seen_at INTEGER NOT NULL DEFAULT 0,typing_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(room_id,user_id,role)
);
