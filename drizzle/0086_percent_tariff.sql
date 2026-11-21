-- One tariff in percent (decision of 2026-11-22). The owner pays 4% of every booking confirmed through the service,
-- the performer 5% of every cleaning accepted through it. Nothing else: «Автопилот», the AI administrator, the match
-- of a performer, protection and analytics are included. Hourly bookings cost less, so their fee is smaller by itself.
-- «Всё включено», the fee per AI booking, the owner's match fee and the fixed fee per cleaning are gone.
-- One booking pays at most 15 000 ₸ (max_fee), so a long stay in a big house is not dearer than a month of a hall.
-- Everything is still summed up and taken from the linked card once a week (lib/service-dues.ts).
-- A banquet hall or a café (types 'banquet' and 'cafe', 2026-11-22): no percent of the event, so nobody argues how
-- many guests came. Each hall pays a fixed sum for a calendar month by its capacity: up to 100 guests 9 900 ₸, up to
-- 300 guests 19 900 ₸, more 29 900 ₸, bookings without limit. A month with no booking through the app is free, and
-- so is the hall's first month with bookings. A guest who phoned the hall is not a booking through the app.
ALTER TABLE platform_billing ADD COLUMN hall_small_upto INTEGER NOT NULL DEFAULT 100 CHECK(hall_small_upto BETWEEN 1 AND 100000);
ALTER TABLE platform_billing ADD COLUMN hall_mid_upto INTEGER NOT NULL DEFAULT 300 CHECK(hall_mid_upto BETWEEN 1 AND 100000);
ALTER TABLE platform_billing ADD COLUMN hall_fee_small INTEGER NOT NULL DEFAULT 9900 CHECK(hall_fee_small BETWEEN 0 AND 10000000);
ALTER TABLE platform_billing ADD COLUMN hall_fee_mid INTEGER NOT NULL DEFAULT 19900 CHECK(hall_fee_mid BETWEEN 0 AND 10000000);
ALTER TABLE platform_billing ADD COLUMN hall_fee_large INTEGER NOT NULL DEFAULT 29900 CHECK(hall_fee_large BETWEEN 0 AND 10000000);
ALTER TABLE platform_billing ADD COLUMN home_rate_bp INTEGER NOT NULL DEFAULT 500 CHECK(home_rate_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_billing ADD COLUMN home_min_fee INTEGER NOT NULL DEFAULT 300 CHECK(home_min_fee BETWEEN 0 AND 100000);
ALTER TABLE platform_billing ADD COLUMN cleaner_rate_bp INTEGER NOT NULL DEFAULT 500 CHECK(cleaner_rate_bp BETWEEN 0 AND 3000);
UPDATE platform_billing SET rate_bp=400,ai_rate_bp=400,max_fee=15000,cleaning_rate_bp=0,pair_rate_bp=0,pair_month_cap=0,
 ai_booking_fee=0,ai_month_cap=0,cleaner_job_fee=0,cleaner_free_jobs=0,cleaner_month_cap=0 WHERE id='global';
-- The month of a hall is a service fee too (kind 'hall_month', ref_id '<property>:<YYYY-MM>'), so the weekly card
-- charge, the balance and the finance reports take it as they take the others. SQLite changes a CHECK only by a rebuild.
-- The cleaning trigger names service_fees, so it goes first and comes back below.
DROP TRIGGER IF EXISTS cleaning_completed_money;
CREATE TABLE service_fees_next (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner','cleaner')),
 kind TEXT NOT NULL CHECK(kind IN ('ai_booking','cleaning','hall_month')),
 ref_id TEXT NOT NULL,
 property_id TEXT,
 amount INTEGER NOT NULL CHECK(amount>=0),
 mode TEXT NOT NULL CHECK(mode IN ('shadow','free','charged')),
 created_at INTEGER NOT NULL,
 UNIQUE(kind,ref_id)
);
INSERT INTO service_fees_next(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at) SELECT id,user_id,role,kind,ref_id,property_id,amount,mode,created_at FROM service_fees;
DROP TABLE service_fees;
ALTER TABLE service_fees_next RENAME TO service_fees;
CREATE INDEX service_fees_user ON service_fees(user_id,mode,created_at);
CREATE INDEX service_fees_month ON service_fees(kind,property_id,created_at);
CREATE TRIGGER account_erased_service_fees_insert BEFORE INSERT ON service_fees WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_service_fees_update BEFORE UPDATE ON service_fees WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;

-- Nobody stays on «Всё включено»: the plan is simply on, paid by the percent.
UPDATE autopilot_plans SET tier='pay',next_tier=NULL WHERE tier='all' OR next_tier IS NOT NULL;

-- An accepted cleaning: the performer pays cleaner_rate_bp of its price (not for the object's own staff). An owner's own
-- home that is only cleaned («Мой дом», type 'home') earns the owner nothing, so the owner pays for the service there:
-- home_rate_bp of the cleaning, at least home_min_fee (5%, at least 300 ₸; never more than the cleaning itself). The owner's
-- match fee is written as before (migration 0073) and is 0 ₸ while cleaning_rate_bp and pair_rate_bp are 0.
CREATE TRIGGER cleaning_completed_money AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='completed' AND OLD.status<>'completed' AND NEW.assigned_to IS NOT NULL
 AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL)
BEGIN
 INSERT OR IGNORE INTO cleaning_commissions(job_id,owner_id,cleaner_id,property_id,fee,rate_bp,amount,pair,mode,created_at)
 SELECT NEW.id,NEW.owner_id,NEW.assigned_to,NEW.property_id,NEW.fee,x.rate,
  CASE WHEN x.pair=1 AND x.cap>0 THEN MIN(x.raw,MAX(0,x.cap-COALESCE((SELECT SUM(amount) FROM cleaning_commissions c WHERE c.owner_id=NEW.owner_id AND c.cleaner_id=NEW.assigned_to AND c.pair=1 AND c.mode=x.mode
   AND c.created_at>=CAST(strftime('%s',date('now','+5 hours','start of month')) AS INTEGER)-18000),0))) ELSE x.raw END,
  x.pair,x.mode,CAST(strftime('%s','now') AS INTEGER)
 FROM (SELECT y.*,MIN(NEW.fee,MAX(y.least,(NEW.fee*y.rate+5000)/10000)) raw FROM (
  SELECT CASE WHEN p.home=1 THEN s.home_rate_bp WHEN p.pair=1 THEN s.pair_rate_bp ELSE s.cleaning_rate_bp END rate,CASE WHEN p.home=1 THEN s.home_min_fee ELSE 0 END least,s.pair_month_cap cap,p.pair,
   CASE WHEN s.enabled=1 AND s.starts_at<=CAST(strftime('%s','now') AS INTEGER) THEN 'charged' ELSE 'shadow' END mode
  FROM platform_billing s,(SELECT EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=NEW.property_id AND cleaner_id=NEW.assigned_to) pair,
   EXISTS(SELECT 1 FROM property_details WHERE property_id=NEW.property_id AND json_extract(details,'$.type')='home') home) p WHERE s.id='global') y) x
 WHERE NEW.fee>0;
 INSERT OR IGNORE INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at)
 SELECT lower(hex(randomblob(16))),NEW.assigned_to,'cleaner','cleaning',NEW.id,NEW.property_id,MIN(NEW.fee,(NEW.fee*x.rate+5000)/10000),x.mode,CAST(strftime('%s','now') AS INTEGER)
 FROM (SELECT s.cleaner_rate_bp rate,CASE WHEN s.plan_charge=0 THEN 'shadow' ELSE 'charged' END mode FROM platform_billing s WHERE s.id='global') x
 WHERE x.rate>0 AND NEW.fee>0
  AND NOT EXISTS(SELECT 1 FROM property_staff WHERE property_id=NEW.property_id AND staff_id=NEW.assigned_to);
END;
