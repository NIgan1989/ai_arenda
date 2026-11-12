-- Platform revenue: owner commission per booking confirmed through the service.
-- Billing starts switched off; every confirmed booking still records a shadow
-- commission so the administrator sees projected revenue before charging anyone.
CREATE TABLE platform_billing (
 id TEXT PRIMARY KEY CHECK(id='global'),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 starts_at INTEGER NOT NULL DEFAULT 0,
 rate_bp INTEGER NOT NULL DEFAULT 500 CHECK(rate_bp BETWEEN 0 AND 3000),
 min_fee INTEGER NOT NULL DEFAULT 0 CHECK(min_fee>=0),
 max_fee INTEGER NOT NULL DEFAULT 0 CHECK(max_fee>=0),
 free_bookings INTEGER NOT NULL DEFAULT 3 CHECK(free_bookings BETWEEN 0 AND 1000),
 version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT,
 updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO platform_billing(id) VALUES ('global');
CREATE TABLE platform_commissions (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 booking_amount INTEGER NOT NULL CHECK(booking_amount>=0),
 rate_bp INTEGER NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>=0),
 mode TEXT NOT NULL CHECK(mode IN ('shadow','free','charged')),
 settings_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX platform_commissions_owner ON platform_commissions(owner_id,mode);
CREATE INDEX platform_commissions_time ON platform_commissions(created_at);
CREATE TABLE owner_balance_entries (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 kind TEXT NOT NULL CHECK(kind IN ('topup','bonus','adjustment')),
 amount INTEGER NOT NULL CHECK(amount<>0 AND amount BETWEEN -100000000 AND 100000000),
 note TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL
);
CREATE INDEX owner_balance_entries_owner ON owner_balance_entries(owner_id,created_at);
-- Bookings confirmed before this migration become shadow history at the default 5%.
INSERT INTO platform_commissions(booking_id,owner_id,property_id,booking_amount,rate_bp,amount,mode,settings_version,created_at)
 SELECT b.id,p.owner_id,b.property_id,b.amount,500,(b.amount*500+5000)/10000,'shadow',1,b.created_at
 FROM bookings b JOIN properties p ON p.id=b.property_id
 WHERE b.status IN ('confirmed','completed') AND p.demo_owner IS NULL AND b.amount>=0;
CREATE TRIGGER account_erased_platform_commissions_insert BEFORE INSERT ON platform_commissions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_platform_commissions_update BEFORE UPDATE ON platform_commissions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_owner_balance_entries_insert BEFORE INSERT ON owner_balance_entries WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_owner_balance_entries_update BEFORE UPDATE ON owner_balance_entries WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.actor_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_platform_billing_update BEFORE UPDATE ON platform_billing WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.updated_by) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
