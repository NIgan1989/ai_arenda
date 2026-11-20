-- The hybrid tariff (decision of 2026-11-20, lib/autopilot-plans.ts, lib/service-fees.ts).
-- By default a participant pays for the result: the owner 490 ₸ for every booking the AI took through (at most
-- 4 900 ₸ a month for one object), the performer 250 ₸ for every accepted cleaning (the first 5 free, at most
-- 6 000 ₸ a month). On top of it, by choice, one subscription «Всё включено»: 9 900 ₸ a month for each object of the
-- owner (no commission, no per-booking fee, no match fee) and 2 900 ₸ a month for the performer (no fee per cleaning).
-- Everything is summed up and taken from the linked card once a week, as before (lib/service-dues.ts).

-- The per-result fees: one row per booking or cleaning; mode works like platform_commissions.
CREATE TABLE service_fees (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner','cleaner')),
 kind TEXT NOT NULL CHECK(kind IN ('ai_booking','cleaning')),
 ref_id TEXT NOT NULL,
 property_id TEXT,
 amount INTEGER NOT NULL CHECK(amount>=0),
 mode TEXT NOT NULL CHECK(mode IN ('shadow','free','charged')),
 created_at INTEGER NOT NULL,
 UNIQUE(kind,ref_id)
);
CREATE INDEX service_fees_user ON service_fees(user_id,mode,created_at);
CREATE INDEX service_fees_month ON service_fees(kind,property_id,created_at);
CREATE TRIGGER account_erased_service_fees_insert BEFORE INSERT ON service_fees WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_service_fees_update BEFORE UPDATE ON service_fees WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;

-- The plan row now says which way the participant pays: 'pay' (for the result, nothing monthly) or 'all'
-- («Всё включено», monthly). next_tier: «Всё включено» paid for this month goes back to 'pay' at its end.
ALTER TABLE autopilot_plans ADD COLUMN tier TEXT NOT NULL DEFAULT 'pay' CHECK(tier IN ('pay','all'));
ALTER TABLE autopilot_plans ADD COLUMN next_tier TEXT CHECK(next_tier IN ('pay','all'));
-- Nobody owes a month any more: a trial or a grace becomes a plain «on», a paused plan stays off.
UPDATE autopilot_plans SET status='active',grace_until=NULL,auto_renew=1 WHERE status IN ('trial','grace');

-- Prices. The monthly plan prices become the prices of «Всё включено»; the trial is gone (paying for the result
-- costs nothing without results).
ALTER TABLE platform_billing ADD COLUMN ai_booking_fee INTEGER NOT NULL DEFAULT 490 CHECK(ai_booking_fee BETWEEN 0 AND 100000);
ALTER TABLE platform_billing ADD COLUMN ai_month_cap INTEGER NOT NULL DEFAULT 4900 CHECK(ai_month_cap BETWEEN 0 AND 1000000);
ALTER TABLE platform_billing ADD COLUMN cleaner_job_fee INTEGER NOT NULL DEFAULT 250 CHECK(cleaner_job_fee BETWEEN 0 AND 100000);
ALTER TABLE platform_billing ADD COLUMN cleaner_free_jobs INTEGER NOT NULL DEFAULT 5 CHECK(cleaner_free_jobs BETWEEN 0 AND 1000);
ALTER TABLE platform_billing ADD COLUMN cleaner_month_cap INTEGER NOT NULL DEFAULT 6000 CHECK(cleaner_month_cap BETWEEN 0 AND 1000000);
UPDATE platform_billing SET plan_owner_price=9900,plan_cleaner_price=2900,plan_trial_days=0 WHERE id='global';

-- An accepted cleaning: the owner's match fee as before (nothing under «Всё включено»), and the performer's fee for
-- the cleaning (not for a regular pair, not for the object's own staff, nothing under the performer's «Всё включено»).
DROP TRIGGER IF EXISTS cleaning_completed_money;
CREATE TRIGGER cleaning_completed_money AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='completed' AND OLD.status<>'completed' AND NEW.assigned_to IS NOT NULL
 AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL)
BEGIN
 INSERT OR IGNORE INTO cleaning_commissions(job_id,owner_id,cleaner_id,property_id,fee,rate_bp,amount,pair,mode,created_at)
 SELECT NEW.id,NEW.owner_id,NEW.assigned_to,NEW.property_id,NEW.fee,x.rate,
  CASE WHEN x.pair=1 AND x.cap>0 THEN MIN(x.raw,MAX(0,x.cap-COALESCE((SELECT SUM(amount) FROM cleaning_commissions c WHERE c.owner_id=NEW.owner_id AND c.cleaner_id=NEW.assigned_to AND c.pair=1 AND c.mode=x.mode
   AND c.created_at>=CAST(strftime('%s',date('now','+5 hours','start of month')) AS INTEGER)-18000),0))) ELSE x.raw END,
  x.pair,x.mode,CAST(strftime('%s','now') AS INTEGER)
 FROM (SELECT y.*,MIN(NEW.fee,(NEW.fee*y.rate+5000)/10000) raw FROM (
  SELECT CASE WHEN EXISTS(SELECT 1 FROM autopilot_plans ap WHERE ap.user_id=NEW.owner_id AND ap.role='owner' AND ap.tier='all' AND ap.status IN ('trial','active','grace')) THEN 0
    WHEN p.pair=1 THEN s.pair_rate_bp ELSE s.cleaning_rate_bp END rate,s.pair_month_cap cap,p.pair,
   CASE WHEN s.enabled=1 AND s.starts_at<=CAST(strftime('%s','now') AS INTEGER) THEN 'charged' ELSE 'shadow' END mode
  FROM platform_billing s,(SELECT EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=NEW.property_id AND cleaner_id=NEW.assigned_to) pair) p WHERE s.id='global') y) x
 WHERE NEW.fee>0;
 INSERT OR IGNORE INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at)
 SELECT lower(hex(randomblob(16))),NEW.assigned_to,'cleaner','cleaning',NEW.id,NEW.property_id,
  CASE WHEN x.mode='free' THEN x.fee ELSE MIN(x.fee,CASE WHEN x.cap>0 THEN MAX(0,x.cap-COALESCE((SELECT SUM(f.amount) FROM service_fees f WHERE f.user_id=NEW.assigned_to AND f.kind='cleaning' AND f.mode=x.mode
   AND f.created_at>=CAST(strftime('%s',date('now','+5 hours','start of month')) AS INTEGER)-18000),0)) ELSE x.fee END) END,
  x.mode,CAST(strftime('%s','now') AS INTEGER)
 FROM (SELECT s.cleaner_job_fee fee,s.cleaner_month_cap cap,
   CASE WHEN s.plan_charge=0 THEN 'shadow'
    WHEN (SELECT COUNT(*) FROM service_fees f WHERE f.user_id=NEW.assigned_to AND f.kind='cleaning' AND f.mode IN ('free','charged'))<s.cleaner_free_jobs THEN 'free' ELSE 'charged' END mode
  FROM platform_billing s WHERE s.id='global') x
 WHERE x.fee>0 AND NEW.fee>0
  AND NOT EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=NEW.property_id AND cleaner_id=NEW.assigned_to)
  AND NOT EXISTS(SELECT 1 FROM property_staff WHERE property_id=NEW.property_id AND staff_id=NEW.assigned_to)
  AND NOT EXISTS(SELECT 1 FROM autopilot_plans ap WHERE ap.user_id=NEW.assigned_to AND ap.role='cleaner' AND ap.tier='all' AND ap.status IN ('trial','active','grace'));
END;
