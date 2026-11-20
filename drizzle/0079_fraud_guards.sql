-- «Предоплата или оплата при заселении» (lib/prepay.ts): the owner's share paid before the arrival, 0 = all at it.
ALTER TABLE property_policies ADD COLUMN prepay_percent INTEGER NOT NULL DEFAULT 0 CHECK(prepay_percent IN (0,10,20,30,50,100));
-- The share in force when the request was made; NULL is an older booking, paid in full in advance as agreed.
ALTER TABLE booking_terms ADD COLUMN prepay_percent INTEGER CHECK(prepay_percent IS NULL OR prepay_percent IN (0,10,20,30,50,100));
-- «Право сдавать жильё» (lib/property-rights.ts): photos of the title, or of the lease with the owner's notarised consent
-- to sublet. A person at the platform looks at them before the place is shown; the AI never approves a place alone.
CREATE TABLE property_right_docs (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('owner','sublease')),
 data TEXT NOT NULL DEFAULT '',
 object_key TEXT NOT NULL DEFAULT '',
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 bytes INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX property_right_docs_place ON property_right_docs(property_id,created_at);
CREATE TRIGGER account_erased_property_right_docs_insert BEFORE INSERT ON property_right_docs WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
-- «Меня не заселили» and the administrator's block (lib/account-restrictions.ts): hold = the owner's places are hidden and
-- take no new bookings until a person looks; blocked = the account is closed. One row per person; lifting deletes it.
CREATE TABLE account_restrictions (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('hold','blocked')),
 reason TEXT NOT NULL,
 booking_id TEXT REFERENCES bookings(id),
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
