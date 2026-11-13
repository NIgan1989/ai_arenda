-- A regular cleaner for a flat: the owner pins one cleaner, every cleaning of that flat is offered to her
-- first and her «yes» assigns her at once. If she is busy or silent, the usual ranked selection takes over.
CREATE TABLE regular_cleaners (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 owner_id TEXT NOT NULL REFERENCES profiles(id),
 cleaner_id TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL
);
CREATE INDEX regular_cleaners_cleaner ON regular_cleaners(cleaner_id);

-- Payment guarantee: when a cleaner is assigned and the owner's service balance covers the fee, the fee is
-- reserved (held). After the owner accepts the work it is due to the cleaner; the service marks the payout (paid).
-- A cleaning that is reopened or cancelled returns the reserve to the owner.
CREATE TABLE cleaning_holds (
 job_id TEXT PRIMARY KEY REFERENCES cleaning_jobs(id),
 owner_id TEXT NOT NULL,
 cleaner_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0),
 status TEXT NOT NULL CHECK(status IN ('held','due','paid','returned')),
 created_at INTEGER NOT NULL,
 due_at INTEGER,
 paid_at INTEGER,
 paid_by TEXT,
 payout_note TEXT
);
CREATE INDEX cleaning_holds_owner ON cleaning_holds(owner_id,status);
CREATE INDEX cleaning_holds_cleaner ON cleaning_holds(cleaner_id,status);

-- Service commission on a finished cleaning, paid by the owner (the cleaner receives the full fee).
-- A regular pair pays the lower pair rate, capped per calendar month (Kazakhstan time).
ALTER TABLE platform_billing ADD COLUMN cleaning_rate_bp INTEGER NOT NULL DEFAULT 1000 CHECK(cleaning_rate_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_billing ADD COLUMN pair_rate_bp INTEGER NOT NULL DEFAULT 500 CHECK(pair_rate_bp BETWEEN 0 AND 3000);
ALTER TABLE platform_billing ADD COLUMN pair_month_cap INTEGER NOT NULL DEFAULT 2000 CHECK(pair_month_cap>=0);
CREATE TABLE cleaning_commissions (
 job_id TEXT PRIMARY KEY REFERENCES cleaning_jobs(id),
 owner_id TEXT NOT NULL,
 cleaner_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 fee INTEGER NOT NULL,
 rate_bp INTEGER NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>=0),
 pair INTEGER NOT NULL CHECK(pair IN (0,1)),
 mode TEXT NOT NULL CHECK(mode IN ('shadow','charged')),
 created_at INTEGER NOT NULL
);
CREATE INDEX cleaning_commissions_owner ON cleaning_commissions(owner_id,mode);
CREATE INDEX cleaning_commissions_pair ON cleaning_commissions(owner_id,cleaner_id,pair,created_at);
CREATE INDEX cleaning_commissions_time ON cleaning_commissions(created_at);

-- Reserve on assignment, when the owner's free balance covers the fee.
CREATE TRIGGER cleaning_hold_on_assign AFTER UPDATE OF status,assigned_to ON cleaning_jobs
WHEN NEW.status='assigned' AND NEW.assigned_to IS NOT NULL AND NEW.fee>0 AND (OLD.status<>'assigned' OR OLD.assigned_to IS NOT NEW.assigned_to)
 AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL)
BEGIN
 UPDATE cleaning_holds SET status='returned' WHERE job_id=NEW.id AND status='held' AND cleaner_id<>NEW.assigned_to;
 INSERT INTO cleaning_holds(job_id,owner_id,cleaner_id,property_id,amount,status,created_at)
 SELECT NEW.id,NEW.owner_id,NEW.assigned_to,NEW.property_id,NEW.fee,'held',CAST(strftime('%s','now') AS INTEGER)
 WHERE COALESCE((SELECT SUM(amount) FROM owner_balance_entries WHERE owner_id=NEW.owner_id),0)
  -COALESCE((SELECT SUM(c.amount) FROM platform_commissions c WHERE c.owner_id=NEW.owner_id AND c.mode='charged' AND (SELECT status FROM bookings WHERE id=c.booking_id) IN ('confirmed','completed')),0)
  -COALESCE((SELECT SUM(amount) FROM cleaning_commissions WHERE owner_id=NEW.owner_id AND mode='charged'),0)
  -COALESCE((SELECT SUM(amount) FROM cleaning_holds WHERE owner_id=NEW.owner_id AND status IN ('held','due','paid') AND job_id<>NEW.id),0)>=NEW.fee
 ON CONFLICT(job_id) DO UPDATE SET cleaner_id=excluded.cleaner_id,amount=excluded.amount,status='held',created_at=excluded.created_at WHERE cleaning_holds.status IN ('held','returned');
END;
-- A cleaning back on the market or cancelled gives the reserve back.
CREATE TRIGGER cleaning_hold_returned AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status IN ('open','cancelled')
BEGIN
 UPDATE cleaning_holds SET status='returned' WHERE job_id=NEW.id AND status='held';
END;
-- Accepted work: the reserve is due to the cleaner and the commission is written.
CREATE TRIGGER cleaning_completed_money AFTER UPDATE OF status ON cleaning_jobs
WHEN NEW.status='completed' AND OLD.status<>'completed' AND NEW.assigned_to IS NOT NULL
 AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND demo_owner IS NULL)
BEGIN
 UPDATE cleaning_holds SET status='due',due_at=CAST(strftime('%s','now') AS INTEGER) WHERE job_id=NEW.id AND status='held';
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

-- Account erasure fences, as for every table that names a participant.
CREATE TRIGGER account_erased_regular_cleaners_insert BEFORE INSERT ON regular_cleaners WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.cleaner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_regular_cleaners_update BEFORE UPDATE ON regular_cleaners WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.cleaner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_holds_insert BEFORE INSERT ON cleaning_holds WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.cleaner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_holds_update BEFORE UPDATE ON cleaning_holds WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.cleaner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_commissions_insert BEFORE INSERT ON cleaning_commissions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.cleaner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaning_commissions_update BEFORE UPDATE ON cleaning_commissions WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.owner_id OR user_id=NEW.cleaner_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
