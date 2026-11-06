ALTER TABLE delivery_outbox ADD COLUMN delivered_at INTEGER;
ALTER TABLE delivery_outbox ADD COLUMN read_at INTEGER;
CREATE TABLE delivery_events (
 channel TEXT NOT NULL CHECK(channel IN ('sms','whatsapp')),event_id TEXT NOT NULL,outbox_id TEXT NOT NULL REFERENCES delivery_outbox(id),
 status TEXT NOT NULL CHECK(status IN ('delivered','read','failed')),payload_hash TEXT NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(channel,event_id)
);
