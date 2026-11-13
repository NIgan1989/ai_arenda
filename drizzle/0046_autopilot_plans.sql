-- «Автопилот» as a paid plan for owners and cleaners. The owner pays per flat under autopilot each month
-- from the service balance; the cleaner pays a flat monthly price withheld from the next payout. Every plan
-- starts with a free trial. While charging is off the service only records what it would have charged.
ALTER TABLE platform_billing ADD COLUMN plan_charge INTEGER NOT NULL DEFAULT 0 CHECK(plan_charge IN (0,1));
ALTER TABLE platform_billing ADD COLUMN plan_owner_price INTEGER NOT NULL DEFAULT 4900 CHECK(plan_owner_price BETWEEN 0 AND 1000000);
ALTER TABLE platform_billing ADD COLUMN plan_cleaner_price INTEGER NOT NULL DEFAULT 1900 CHECK(plan_cleaner_price BETWEEN 0 AND 1000000);
ALTER TABLE platform_billing ADD COLUMN plan_trial_days INTEGER NOT NULL DEFAULT 14 CHECK(plan_trial_days BETWEEN 0 AND 90);
ALTER TABLE platform_billing ADD COLUMN plan_grace_days INTEGER NOT NULL DEFAULT 3 CHECK(plan_grace_days BETWEEN 0 AND 30);

-- One plan per person and role. trial and active run until period_end; grace runs until grace_until while the
-- payment is retried; paused means the autopilot is off until the person turns it on again.
CREATE TABLE autopilot_plans (
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner','cleaner')),
 status TEXT NOT NULL CHECK(status IN ('trial','active','grace','paused')),
 started_at INTEGER NOT NULL,
 period_end INTEGER NOT NULL,
 grace_until INTEGER,
 auto_renew INTEGER NOT NULL DEFAULT 1 CHECK(auto_renew IN (0,1)),
 trial_used INTEGER NOT NULL DEFAULT 1 CHECK(trial_used IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,role)
);
CREATE INDEX autopilot_plans_due ON autopilot_plans(status,period_end);

-- One row per paid month. mode 'shadow' is what charging would have taken while it is off.
-- A cleaner's charge is withheld from a payout: settled_at marks the payout that covered it.
CREATE TABLE autopilot_charges (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner','cleaner')),
 period_start INTEGER NOT NULL,
 period_end INTEGER NOT NULL,
 units INTEGER NOT NULL CHECK(units>=0),
 amount INTEGER NOT NULL CHECK(amount>=0),
 mode TEXT NOT NULL CHECK(mode IN ('charged','shadow')),
 settled_at INTEGER,
 settled_job TEXT,
 created_at INTEGER NOT NULL,
 UNIQUE(user_id,role,period_start)
);
CREATE INDEX autopilot_charges_user ON autopilot_charges(user_id,role,mode);

-- The cleaner's autopilot rules: the AI accepts an offer for her only when every rule fits.
CREATE TABLE cleaner_autopilot (
 user_id TEXT PRIMARY KEY REFERENCES profiles(id),
 districts TEXT NOT NULL DEFAULT '[]',
 days INTEGER NOT NULL DEFAULT 127 CHECK(days BETWEEN 0 AND 127),
 from_minute INTEGER NOT NULL DEFAULT 540 CHECK(from_minute BETWEEN 0 AND 1440),
 to_minute INTEGER NOT NULL DEFAULT 1200 CHECK(to_minute BETWEEN 0 AND 1440),
 min_fee INTEGER NOT NULL DEFAULT 0 CHECK(min_fee>=0),
 max_per_day INTEGER NOT NULL DEFAULT 4 CHECK(max_per_day BETWEEN 1 AND 20),
 ask_new_owner INTEGER NOT NULL DEFAULT 1 CHECK(ask_new_owner IN (0,1)),
 paused_until INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);

-- Owners whose flats are already under the AI keep it: they start on the free trial.
INSERT OR IGNORE INTO autopilot_plans(user_id,role,status,started_at,period_end,updated_at)
SELECT DISTINCT p.owner_id,'owner','trial',CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)+14*86400,CAST(strftime('%s','now') AS INTEGER)
FROM properties p JOIN property_policies pp ON pp.property_id=p.id JOIN operation_rules r ON r.property_id=p.id JOIN matching_preferences m ON m.property_id=p.id
WHERE pp.auto_confirm=1 AND pp.auto_assign=1 AND pp.cleaning_fee>0 AND r.auto_offers=1 AND r.auto_replace=1 AND m.enabled=1;

-- The owner's free balance now also excludes the autopilot months already paid.
DROP TRIGGER IF EXISTS cleaning_hold_on_assign;
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
  -COALESCE((SELECT SUM(amount) FROM cleaning_holds WHERE owner_id=NEW.owner_id AND status IN ('held','due','paid') AND job_id<>NEW.id),0)
  -COALESCE((SELECT SUM(amount) FROM autopilot_charges WHERE user_id=NEW.owner_id AND role='owner' AND mode='charged'),0)>=NEW.fee
 ON CONFLICT(job_id) DO UPDATE SET cleaner_id=excluded.cleaner_id,amount=excluded.amount,status='held',created_at=excluded.created_at WHERE cleaning_holds.status IN ('held','returned');
END;

-- Erased accounts cannot get a plan, a charge or autopilot rules back.
CREATE TRIGGER account_erased_autopilot_plans_insert BEFORE INSERT ON autopilot_plans WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_autopilot_plans_update BEFORE UPDATE ON autopilot_plans WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_autopilot_charges_insert BEFORE INSERT ON autopilot_charges WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_autopilot_charges_update BEFORE UPDATE ON autopilot_charges WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaner_autopilot_insert BEFORE INSERT ON cleaner_autopilot WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_cleaner_autopilot_update BEFORE UPDATE ON cleaner_autopilot WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
