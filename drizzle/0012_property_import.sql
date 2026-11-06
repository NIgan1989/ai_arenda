CREATE TABLE property_imports (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES profiles(id),source TEXT NOT NULL,
 payload_hash TEXT NOT NULL,rows_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','committed')),
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 commit_hash TEXT,result TEXT
);
CREATE INDEX property_imports_owner ON property_imports(owner_id,created_at);
CREATE TABLE property_import_links (
 owner_id TEXT NOT NULL REFERENCES profiles(id),source TEXT NOT NULL,external_id TEXT NOT NULL,
 address_key TEXT NOT NULL,property_id TEXT NOT NULL UNIQUE REFERENCES properties(id),created_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,source,external_id),UNIQUE(owner_id,address_key)
);
