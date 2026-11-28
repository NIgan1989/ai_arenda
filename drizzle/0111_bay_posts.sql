-- «Запись и живая очередь» of a car place (lib/bay-plan.ts, lib/bays.ts, 2026-11-28).
-- A car wash is run by its admins in shifts: an object takes several people on shift now, not one.
-- The cleaning trigger names property_staff (its own people clean free), so it goes first and comes back below.
DROP TRIGGER IF EXISTS cleaning_completed_money;
DROP TRIGGER IF EXISTS account_erased_property_staff_insert;
CREATE TABLE property_staff_next (
 property_id TEXT NOT NULL REFERENCES properties(id),
 staff_id TEXT NOT NULL REFERENCES profiles(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(property_id,staff_id)
);
INSERT INTO property_staff_next(property_id,staff_id,owner_id,created_at) SELECT property_id,staff_id,owner_id,created_at FROM property_staff;
DROP TABLE property_staff;
ALTER TABLE property_staff_next RENAME TO property_staff;
CREATE INDEX property_staff_person ON property_staff(staff_id);
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
CREATE TRIGGER account_erased_property_staff_insert BEFORE INSERT ON property_staff WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.staff_id OR user_id=NEW.owner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
-- The live state of each box, from the taps of the person on shift: busy since when (NULL: free). The card's own row
-- (its first box) also keeps the cars waiting, the average minutes of a wash and the time of the last tap at the place.
CREATE TABLE bay_live (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 busy_since INTEGER,
 waiting INTEGER NOT NULL DEFAULT 0 CHECK(waiting BETWEEN 0 AND 99),
 avg_minutes INTEGER,
 marked_at INTEGER
);
