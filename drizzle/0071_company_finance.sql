-- The business is an ИП on the simplified declaration with a Kaspi Pay account by default (the
-- owner's choice of 2026-11-19); a ТОО on the general regime is a settings change away.
-- Guests pay owners and owners pay cleaners directly: only commissions and «Автопилот» reach the
-- business account, so acquiring_bp applies to that money and not to the guests' payments.
-- Company finance for the platform administrator: the service's own costs, tax assumptions
-- and the founder's money movements. Revenue is never stored here: it is read from the
-- commission tables, so the reports always match what owners and cleaners were charged.
CREATE TABLE company_finance_settings (
 id TEXT PRIMARY KEY CHECK(id='global'),
 entity TEXT NOT NULL DEFAULT 'ip' CHECK(entity IN ('ip','too')),
 company_name TEXT NOT NULL DEFAULT 'AiQonaq' CHECK(length(company_name) BETWEEN 1 AND 80),
 start_month TEXT NOT NULL,
 tax_regime TEXT NOT NULL DEFAULT 'simplified' CHECK(tax_regime IN ('general','simplified')),
 cit_bp INTEGER NOT NULL DEFAULT 2000 CHECK(cit_bp BETWEEN 0 AND 5000),
 simplified_bp INTEGER NOT NULL DEFAULT 400 CHECK(simplified_bp BETWEEN 0 AND 2000),
 vat_registered INTEGER NOT NULL DEFAULT 0 CHECK(vat_registered IN (0,1)),
 vat_bp INTEGER NOT NULL DEFAULT 1600 CHECK(vat_bp BETWEEN 0 AND 3000),
 vat_threshold_mrp INTEGER NOT NULL DEFAULT 10000 CHECK(vat_threshold_mrp BETWEEN 0 AND 1000000),
 mrp INTEGER NOT NULL DEFAULT 4325 CHECK(mrp BETWEEN 1 AND 100000),
 mzp INTEGER NOT NULL DEFAULT 85000 CHECK(mzp BETWEEN 1 AND 10000000),
 owner_base INTEGER NOT NULL DEFAULT 85000 CHECK(owner_base BETWEEN 0 AND 100000000),
 vosms_self_bp INTEGER NOT NULL DEFAULT 500 CHECK(vosms_self_bp BETWEEN 0 AND 3000),
 usd_rate INTEGER NOT NULL DEFAULT 520 CHECK(usd_rate BETWEEN 1 AND 100000),
 opv_bp INTEGER NOT NULL DEFAULT 1000 CHECK(opv_bp BETWEEN 0 AND 3000),
 vosms_employee_bp INTEGER NOT NULL DEFAULT 200 CHECK(vosms_employee_bp BETWEEN 0 AND 3000),
 ipn_bp INTEGER NOT NULL DEFAULT 1000 CHECK(ipn_bp BETWEEN 0 AND 3000),
 ipn_deduction_mrp INTEGER NOT NULL DEFAULT 30 CHECK(ipn_deduction_mrp BETWEEN 0 AND 1000),
 sn_bp INTEGER NOT NULL DEFAULT 600 CHECK(sn_bp BETWEEN 0 AND 3000),
 so_bp INTEGER NOT NULL DEFAULT 500 CHECK(so_bp BETWEEN 0 AND 3000),
 opvr_bp INTEGER NOT NULL DEFAULT 350 CHECK(opvr_bp BETWEEN 0 AND 3000),
 vosms_employer_bp INTEGER NOT NULL DEFAULT 300 CHECK(vosms_employer_bp BETWEEN 0 AND 3000),
 acquiring_bp INTEGER NOT NULL DEFAULT 95 CHECK(acquiring_bp BETWEEN 0 AND 3000),
 share_capital INTEGER NOT NULL DEFAULT 0 CHECK(share_capital BETWEEN 0 AND 10000000000),
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
INSERT INTO company_finance_settings(id,start_month,updated_at) VALUES('global','2026-11',CAST(strftime('%s','now') AS INTEGER));

-- Recurring and one-off costs. Staff on an employment contract carry payroll taxes; outsourced
-- people (an ИП or a firm) are paid the amount as is. A USD amount is kept in cents.
CREATE TABLE company_costs (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('staff','service','opex')),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 0 AND 10000000000),
 currency TEXT NOT NULL DEFAULT 'KZT' CHECK(currency IN ('KZT','USD')),
 period TEXT NOT NULL DEFAULT 'month' CHECK(period IN ('month','year','once')),
 employment TEXT NOT NULL DEFAULT 'none' CHECK(employment IN ('none','employee','outsource')),
 start_month TEXT NOT NULL,
 end_month TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 note TEXT NOT NULL DEFAULT '',
 sort INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX company_costs_kind ON company_costs(kind,sort);
INSERT INTO company_costs(id,kind,name,amount,currency,period,employment,start_month,active,note,sort,created_at,updated_at) VALUES
 ('seed-operator','staff','Оператор-администратор',350000,'KZT','month','employee','2026-11',0,'Оценка, включите при найме',20,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-developer','staff','Программист',1000000,'KZT','month','employee','2026-11',0,'Оценка, включите при найме',30,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-accountant','staff','Бухгалтер на аутсорсе',30000,'KZT','month','outsource','2026-11',1,'Ведёт учёт ИП и сдаёт форму 910.00',40,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-stadia','service','Stadia Maps (маршруты на карте)',2000,'USD','month','none','2026-11',1,'Тариф Starter',10,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-cloudflare','service','Cloudflare Workers (сервер и база)',500,'USD','month','none','2026-11',0,'Сейчас бесплатный тариф, платный при росте',20,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-ai-team','service','ИИ-сотрудники (подписки)',170000,'KZT','month','none','2026-11',1,'Claude и другие помощники',30,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-apple','service','Apple Developer (App Store)',9900,'USD','year','none','2026-11',0,'Нужен для TestFlight и App Store',40,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-google','service','Google Play Console',2500,'USD','once','none','2026-11',0,'Разовый взнос',50,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-ads','opex','Реклама в Instagram',120000,'KZT','month','none','2026-11',0,'Включите, когда объектов на карте станет 20+',10,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER)),
 ('seed-bank','opex','Банк и связь',15000,'KZT','month','none','2026-11',0,'Телефон, интернет; счёт Kaspi Pay для ИП бесплатный',20,CAST(strftime('%s','now') AS INTEGER),CAST(strftime('%s','now') AS INTEGER));

-- Money that is not income or expense: the founder's contributions, loans, dividends and
-- equipment purchases. Together with costs and revenue it closes the balance sheet.
CREATE TABLE company_cash_entries (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('capital','loan','loan_repay','dividend','asset')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000000000),
 month TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX company_cash_entries_month ON company_cash_entries(month);

-- Who recorded a row is kept in audit_events, not here. Taxes the accountant marked as paid. Until then the accrued tax stays a liability.
CREATE TABLE company_tax_payments (
 id TEXT PRIMARY KEY,
 tax TEXT NOT NULL CHECK(tax IN ('cit','simplified','vat','ipn','opv','vosms_employee','sn','so','opvr','vosms_employer','self_opv','self_opvr','self_so','self_vosms')),
 period TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000000000),
 month TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX company_tax_payments_month ON company_tax_payments(month,tax);
