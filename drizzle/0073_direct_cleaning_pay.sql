-- Direct settlements, cleanings: the owner pays the performer himself, so the service no longer reserves the
-- cleaning's sum on the owner's balance and pays nobody. The table of reserves stays for the history
-- (lib/company-finance.ts reads it); nothing writes to it any more.
DROP TRIGGER IF EXISTS cleaning_hold_on_assign;
DROP TRIGGER IF EXISTS cleaning_hold_returned;
DROP TRIGGER IF EXISTS cleaning_completed_money;
-- Accepted work still writes the service's own fee for the match.
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
END;
-- Reserves that were never paid out go back to the owners: these cleanings are settled directly.
UPDATE cleaning_holds SET status='returned' WHERE status IN ('held','due');
-- «Деньги получены»: the performer confirms the owner's transfer.
ALTER TABLE cleaning_jobs ADD COLUMN payment_received_at INTEGER;
-- Cleanings paid before this change have nothing to confirm.
UPDATE cleaning_jobs SET payment_received_at=settled_at WHERE settled_at IS NOT NULL;
