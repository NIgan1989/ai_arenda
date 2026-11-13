-- A chat message notice says who wrote, in which chat and what: it is the text of the push on the phone.
-- Long messages are cut to 140 characters; a photo sent without words (stored as «Фотография») reads «фото».
DROP TRIGGER IF EXISTS discussion_message_notification;
CREATE TRIGGER discussion_message_notification AFTER INSERT ON discussion_messages BEGIN
 INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at)
 SELECT lower(hex(randomblob(16))),json_extract(m.value,'$.id'),
 COALESCE((SELECT name FROM profiles WHERE id=NEW.sender_id),'Участник')||' ('||CASE NEW.sender_role WHEN 'owner' THEN 'владелец' WHEN 'guest' THEN 'гость' ELSE 'исполнитель' END||') в чате «'||r.title||'»: '||
 CASE WHEN NEW.photo_data<>'' AND NEW.body='Фотография' THEN 'фото' WHEN length(NEW.body)>140 THEN substr(NEW.body,1,140)||'…' ELSE NEW.body END||CASE WHEN NEW.photo_data<>'' AND NEW.body<>'Фотография' THEN ' (+ фото)' ELSE '' END,
 json_extract(m.value,'$.role')||':discussion:'||NEW.room_id||':'||NEW.seq,0,NEW.created_at
 FROM discussion_rooms r,json_each(r.members) m
 WHERE r.id=NEW.room_id AND json_extract(m.value,'$.id')<>NEW.sender_id;
END;
