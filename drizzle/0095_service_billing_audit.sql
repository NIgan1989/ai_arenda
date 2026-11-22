-- Service billing audit (2026-11-22).
-- A free start for everyone (decision of 2026-11-22, instead of the first free bookings): for free_days (14) calendar
-- days from the owner's first listing, or from the start of billing if that is later, nothing is charged for stays
-- confirmed in them (lib/platform-billing.ts) nor for «Мой дом»; a performer pays nothing for cleanings accepted in the
-- 14 days from the first one charged. The global count of free bookings is replaced by it.
ALTER TABLE platform_billing ADD COLUMN free_days INTEGER NOT NULL DEFAULT 14 CHECK(free_days BETWEEN 0 AND 90);
UPDATE platform_billing SET free_bookings=0 WHERE id='global';
-- A test card charge is kept apart from real money: it settles the debt in the test pilot but never counts as cash.
ALTER TABLE owner_balance_entries ADD COLUMN test INTEGER NOT NULL DEFAULT 0 CHECK(test IN (0,1));
UPDATE owner_balance_entries SET test=1 WHERE actor_id='system:service-billing' AND note LIKE '%(тест)';
-- The capacity of a hall when its booking was confirmed: a month is billed by the halls it had, not by a later edit.
ALTER TABLE platform_commissions ADD COLUMN capacity INTEGER;
UPDATE platform_commissions SET capacity=(SELECT capacity FROM properties WHERE id=platform_commissions.property_id);
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
 FROM (SELECT y.*,CASE WHEN y.fresh=1 THEN 0 ELSE MIN(NEW.fee,MAX(y.least,(NEW.fee*y.rate+5000)/10000)) END raw FROM (
  SELECT CASE WHEN p.home=1 THEN s.home_rate_bp WHEN p.pair=1 THEN s.pair_rate_bp ELSE s.cleaning_rate_bp END rate,CASE WHEN p.home=1 THEN s.home_min_fee ELSE 0 END least,s.pair_month_cap cap,p.pair,
   CASE WHEN s.enabled=1 AND s.starts_at<=CAST(strftime('%s','now') AS INTEGER) THEN 'charged' ELSE 'shadow' END mode,
   CASE WHEN s.enabled=1 AND MAX(s.starts_at,COALESCE((SELECT MIN(created_at) FROM properties WHERE owner_id=NEW.owner_id AND demo_owner IS NULL),0))+s.free_days*86400>CAST(strftime('%s','now') AS INTEGER) THEN 1 ELSE 0 END fresh
  FROM platform_billing s,(SELECT EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=NEW.property_id AND cleaner_id=NEW.assigned_to) pair,
   EXISTS(SELECT 1 FROM property_details WHERE property_id=NEW.property_id AND json_extract(details,'$.type')='home') home) p WHERE s.id='global') y) x
 WHERE NEW.fee>0;
 INSERT OR IGNORE INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at)
 SELECT lower(hex(randomblob(16))),NEW.assigned_to,'cleaner','cleaning',NEW.id,NEW.property_id,MIN(NEW.fee,(NEW.fee*x.rate+5000)/10000),x.mode,CAST(strftime('%s','now') AS INTEGER)
 FROM (SELECT s.cleaner_rate_bp rate,CASE WHEN s.plan_charge=0 THEN 'shadow'
   WHEN COALESCE((SELECT MIN(f.created_at) FROM service_fees f WHERE f.user_id=NEW.assigned_to AND f.kind='cleaning' AND f.mode<>'shadow'),CAST(strftime('%s','now') AS INTEGER))+s.free_days*86400>CAST(strftime('%s','now') AS INTEGER) THEN 'free'
   ELSE 'charged' END mode FROM platform_billing s WHERE s.id='global') x
 WHERE x.rate>0 AND NEW.fee>0
  AND NOT EXISTS(SELECT 1 FROM autopilot_plans ap WHERE ap.user_id=NEW.assigned_to AND ap.role='cleaner' AND ap.tier='all' AND ap.status IN ('trial','active','grace'))
  AND NOT EXISTS(SELECT 1 FROM property_staff WHERE property_id=NEW.property_id AND staff_id=NEW.assigned_to);
END;
