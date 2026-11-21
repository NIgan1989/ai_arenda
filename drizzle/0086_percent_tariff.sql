-- One tariff in percent (decision of 2026-11-22). The owner pays 4% of every booking confirmed through the service,
-- the performer 5% of every cleaning accepted through it. Nothing else: «Автопилот», the AI administrator, the match
-- of a performer, protection and analytics are included. Hourly bookings cost less, so their fee is smaller by itself.
-- «Всё включено», the fee per AI booking, the owner's match fee and the fixed fee per cleaning are gone.
-- One booking pays at most 15 000 ₸ (max_fee), so a banquet hall does not pay 40 000 ₸ for one evening.
-- Everything is still summed up and taken from the linked card once a week (lib/service-dues.ts).
-- A banquet hall or a café (types 'banquet' and 'cafe') has a large bill: the guest gives the number of guests, the
-- hall its price per guest, and the event's total is paid in steps, like a tax scale, so a bigger event is never
-- dearer by a jump: 2% of the first 300 000 ₸, 1% of the part up to 1 000 000 ₸, 0,5% above, at most 15 000 ₸ for
-- one event (a funeral meal for 80 at 3 500 ₸ pays 5 600 ₸, a той for 250 at 8 000 ₸ pays 15 000 ₸). Only a booking that came through the service pays; a guest who phoned the hall and
-- was put into the calendar by the hall itself pays nothing.
ALTER TABLE platform_billing ADD COLUMN hall_rate_bp INTEGER NOT NULL DEFAULT 200 CHECK(hall_rate_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_billing ADD COLUMN hall_band1 INTEGER NOT NULL DEFAULT 300000 CHECK(hall_band1 BETWEEN 0 AND 100000000);
ALTER TABLE platform_billing ADD COLUMN hall_rate2_bp INTEGER NOT NULL DEFAULT 100 CHECK(hall_rate2_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_billing ADD COLUMN hall_band2 INTEGER NOT NULL DEFAULT 1000000 CHECK(hall_band2 BETWEEN 0 AND 100000000);
ALTER TABLE platform_billing ADD COLUMN hall_rate3_bp INTEGER NOT NULL DEFAULT 50 CHECK(hall_rate3_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_billing ADD COLUMN hall_max_fee INTEGER NOT NULL DEFAULT 15000 CHECK(hall_max_fee BETWEEN 0 AND 10000000);
ALTER TABLE platform_billing ADD COLUMN cleaner_rate_bp INTEGER NOT NULL DEFAULT 500 CHECK(cleaner_rate_bp BETWEEN 0 AND 3000);
UPDATE platform_billing SET rate_bp=400,ai_rate_bp=400,max_fee=15000,cleaning_rate_bp=0,pair_rate_bp=0,pair_month_cap=0,
 ai_booking_fee=0,ai_month_cap=0,cleaner_job_fee=0,cleaner_free_jobs=0,cleaner_month_cap=0 WHERE id='global';
-- Nobody stays on «Всё включено»: the plan is simply on, paid by the percent.
UPDATE autopilot_plans SET tier='pay',next_tier=NULL WHERE tier='all' OR next_tier IS NOT NULL;

-- An accepted cleaning: the performer pays cleaner_rate_bp of its price (not for the object's own staff). The owner's
-- match fee is written as before (migration 0073) and is 0 ₸ while cleaning_rate_bp and pair_rate_bp are 0.
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
  SELECT CASE WHEN p.pair=1 THEN s.pair_rate_bp ELSE s.cleaning_rate_bp END rate,s.pair_month_cap cap,p.pair,
   CASE WHEN s.enabled=1 AND s.starts_at<=CAST(strftime('%s','now') AS INTEGER) THEN 'charged' ELSE 'shadow' END mode
  FROM platform_billing s,(SELECT EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=NEW.property_id AND cleaner_id=NEW.assigned_to) pair) p WHERE s.id='global') y) x
 WHERE NEW.fee>0;
 INSERT OR IGNORE INTO service_fees(id,user_id,role,kind,ref_id,property_id,amount,mode,created_at)
 SELECT lower(hex(randomblob(16))),NEW.assigned_to,'cleaner','cleaning',NEW.id,NEW.property_id,MIN(NEW.fee,(NEW.fee*x.rate+5000)/10000),x.mode,CAST(strftime('%s','now') AS INTEGER)
 FROM (SELECT s.cleaner_rate_bp rate,CASE WHEN s.plan_charge=0 THEN 'shadow' ELSE 'charged' END mode FROM platform_billing s WHERE s.id='global') x
 WHERE x.rate>0 AND NEW.fee>0
  AND NOT EXISTS(SELECT 1 FROM property_staff WHERE property_id=NEW.property_id AND staff_id=NEW.assigned_to);
END;
