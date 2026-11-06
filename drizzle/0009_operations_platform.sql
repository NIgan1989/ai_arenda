CREATE TABLE background_jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','dead')),
 attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 8,
 available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT NOT NULL DEFAULT '',
 repeat_seconds INTEGER NOT NULL DEFAULT 0, last_completed INTEGER, last_error TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE INDEX background_due ON background_jobs(status,available_at,lease_until);
CREATE TABLE delivery_channels (
 user_id TEXT NOT NULL REFERENCES profiles(id), role TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('telegram','sms','whatsapp')),
 address TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, verified_at INTEGER, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role,channel)
);
CREATE TABLE delivery_links (hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
CREATE TABLE delivery_outbox (
 id TEXT PRIMARY KEY, notification_id TEXT NOT NULL REFERENCES notifications(id), user_id TEXT NOT NULL, role TEXT NOT NULL, channel TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','dead','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,available_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,lease_token TEXT NOT NULL DEFAULT '',
 provider_reference TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,sent_at INTEGER,
 UNIQUE(notification_id,channel)
);
CREATE INDEX delivery_due ON delivery_outbox(status,available_at,lease_until);
CREATE TRIGGER notification_outbox AFTER INSERT ON notifications BEGIN
 INSERT OR IGNORE INTO delivery_outbox(id,notification_id,user_id,role,channel,available_at,created_at)
 SELECT lower(hex(randomblob(16))),NEW.id,NEW.user_id,c.role,c.channel,NEW.created_at,NEW.created_at FROM delivery_channels c
 WHERE c.user_id=NEW.user_id AND c.enabled=1 AND c.verified_at IS NOT NULL AND NEW.dedupe LIKE c.role||':%';
END;
CREATE TABLE administrator_commands (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,role TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,preview TEXT NOT NULL,
 request_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','executed','rejected','failed')),
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,result TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,
 UNIQUE(user_id,role,request_key)
);
CREATE TABLE operation_rules (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),auto_offers INTEGER NOT NULL DEFAULT 0 CHECK(auto_offers IN (0,1)),
 auto_replace INTEGER NOT NULL DEFAULT 0 CHECK(auto_replace IN (0,1)),require_photos INTEGER NOT NULL DEFAULT 0 CHECK(require_photos IN (0,1)),
 offer_minutes INTEGER NOT NULL DEFAULT 10 CHECK(offer_minutes BETWEEN 2 AND 120),version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL
);
CREATE TABLE worker_dispatch (user_id TEXT PRIMARY KEY REFERENCES profiles(id),receive_offers INTEGER NOT NULL DEFAULT 0 CHECK(receive_offers IN (0,1)),updated_at INTEGER NOT NULL);
CREATE TABLE cleaning_offers (
 id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES cleaning_jobs(id),worker_id TEXT NOT NULL REFERENCES profiles(id),
 job_version INTEGER NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,fee INTEGER NOT NULL,
 replacement_allowed INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'offered' CHECK(status IN ('offered','accepted','declined','expired','superseded')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,decided_at INTEGER,UNIQUE(job_id,worker_id,job_version)
);
CREATE INDEX cleaning_offer_worker ON cleaning_offers(worker_id,status,expires_at);
CREATE TABLE job_evidence (
 id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES cleaning_jobs(id),user_id TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN ('before','after','damage')),
 data TEXT NOT NULL,object_key TEXT NOT NULL DEFAULT '',width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,
 note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL
);
CREATE INDEX evidence_job ON job_evidence(job_id,phase,created_at);
CREATE TABLE finance_entries (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,property_id TEXT NOT NULL REFERENCES properties(id),booking_id TEXT REFERENCES bookings(id),job_id TEXT REFERENCES cleaning_jobs(id),
 kind TEXT NOT NULL CHECK(kind IN ('payment','deposit','refund','deposit_return','job_payment','expense','compensation')),
 amount INTEGER NOT NULL CHECK(amount>0),currency TEXT NOT NULL DEFAULT 'KZT' CHECK(currency='KZT'),
 source TEXT NOT NULL CHECK(source IN ('owner','provider','legacy')),external_reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL,
 actor_id TEXT NOT NULL,request_key TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(actor_id,request_key)
);
CREATE INDEX finance_property ON finance_entries(owner_id,property_id,created_at);
CREATE INDEX finance_booking ON finance_entries(booking_id,kind);
CREATE TRIGGER finance_no_update BEFORE UPDATE ON finance_entries BEGIN SELECT RAISE(ABORT,'immutable_finance_entry'); END;
CREATE TRIGGER finance_no_delete BEFORE DELETE ON finance_entries BEGIN SELECT RAISE(ABORT,'immutable_finance_entry'); END;
CREATE TABLE payment_intents (
 id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),user_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('payment','deposit')),
 amount INTEGER NOT NULL CHECK(amount>0),currency TEXT NOT NULL DEFAULT 'KZT',status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','processing','ready','paid','failed')),
 checkout_url TEXT NOT NULL DEFAULT '',provider_reference TEXT NOT NULL DEFAULT '',request_key TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,request_key)
);
CREATE TABLE provider_events (provider TEXT NOT NULL,event_id TEXT NOT NULL,intent_id TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(provider,event_id));
CREATE TABLE phone_verifications (user_id TEXT PRIMARY KEY,phone TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent_at INTEGER NOT NULL,verified_at INTEGER);
CREATE TABLE participant_reviews (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),role TEXT NOT NULL,property_id TEXT REFERENCES properties(id),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),method TEXT NOT NULL DEFAULT '',reference TEXT NOT NULL DEFAULT '',reviewer_id TEXT,notes TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,reviewed_at INTEGER,valid_until INTEGER,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX participant_review_user ON participant_reviews(user_id,role,status);
CREATE TABLE property_access (property_id TEXT PRIMARY KEY REFERENCES properties(id),ciphertext TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
CREATE TABLE access_receipts (id TEXT PRIMARY KEY,property_id TEXT NOT NULL,entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE calendar_sources (id TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id),owner_id TEXT NOT NULL,label TEXT NOT NULL,url TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,last_success INTEGER,last_attempt INTEGER,last_error TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);
CREATE TABLE external_blocks (id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES calendar_sources(id),property_id TEXT NOT NULL REFERENCES properties(id),event_uid TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,CHECK(end>start),UNIQUE(source_id,event_uid));
CREATE INDEX external_block_interval ON external_blocks(property_id,start,end);
CREATE TABLE calendar_exports (hash TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id),owner_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER);
CREATE TRIGGER booking_external_insert BEFORE INSERT ON bookings WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=NEW.property_id AND s.enabled=1 AND x.start<NEW.occupied_until AND x.end>NEW.start) THEN RAISE(ABORT,'external_calendar_overlap') END;
END;
CREATE TRIGGER booking_external_update BEFORE UPDATE OF start,end,occupied_until,status ON bookings WHEN NEW.status='confirmed' OR (NEW.status='requested' AND NEW.expires_at>unixepoch()) BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=NEW.property_id AND s.enabled=1 AND x.start<NEW.occupied_until AND x.end>NEW.start) THEN RAISE(ABORT,'external_calendar_overlap') END;
END;

CREATE TABLE finance_backfill_receipts (entity_key TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE operation_receipts (user_id TEXT NOT NULL,kind TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,kind,request_key));
CREATE TRIGGER cleaning_property_interval_insert BEFORE INSERT ON cleaning_jobs WHEN NEW.status IN ('open','assigned','in_progress','submitted') BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings b WHERE b.property_id=NEW.property_id AND (NEW.booking_id IS NULL OR b.id<>NEW.booking_id) AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>unixepoch())) AND b.start<NEW.end AND b.occupied_until>NEW.start) THEN RAISE(ABORT,'booking_overlap') END;
END;
