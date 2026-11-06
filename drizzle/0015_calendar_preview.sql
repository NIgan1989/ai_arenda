ALTER TABLE calendar_sources ADD COLUMN provider TEXT NOT NULL DEFAULT 'manual' CHECK(provider IN ('manual','booking','airbnb','vrbo','other'));
ALTER TABLE calendar_sources ADD COLUMN external_property_id TEXT NOT NULL DEFAULT '';
ALTER TABLE calendar_sources ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX calendar_source_mapping ON calendar_sources(owner_id,provider,external_property_id) WHERE external_property_id<>'' AND enabled=1;
CREATE TABLE calendar_previews (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES calendar_sources(id),
 source_version INTEGER NOT NULL,content_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX calendar_previews_owner ON calendar_previews(user_id,expires_at);
