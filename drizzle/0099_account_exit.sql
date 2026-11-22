-- Audit «Выход из сервиса» 2026-11-22 and the finance archive audit.
-- A new deletion request is a new attempt: it keeps a link to the previous one, so the operator sees both stages.
ALTER TABLE deletion_requests ADD COLUMN previous_id TEXT NOT NULL DEFAULT '';
-- How long each kind of kept record lives after an account is closed. Draft values until the accountant and the lawyer
-- confirm them: five full years from 1 January after the last operation.
CREATE TABLE retention_rules (
 category TEXT PRIMARY KEY CHECK(category IN ('deals','money','chats','documents')),
 label TEXT NOT NULL,
 basis TEXT NOT NULL,
 years INTEGER NOT NULL CHECK(years BETWEEN 0 AND 75),
 draft INTEGER NOT NULL DEFAULT 1 CHECK(draft IN (0,1)),
 updated_at INTEGER NOT NULL
);
INSERT INTO retention_rules(category,label,basis,years,draft,updated_at) VALUES
 ('deals','Брони и уборки без имени','Подтверждение исполнения договоров и разбор споров',5,1,0),
 ('money','Суммы, комиссии и оплаты','Бухгалтерский учёт и налоговая проверка',5,1,0),
 ('chats','Переписка по сделкам','Разбор споров по сделкам',5,1,0),
 ('documents','Согласие с офертой и отметки проверок','Подтверждение согласия и проверок',5,1,0);
-- What happened to each group of data when an account was closed. Linked to the receipt only, never to the person.
CREATE TABLE account_erasure_results (
 receipt_id TEXT NOT NULL REFERENCES account_erasure_receipts(id),
 category TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('deleted','anonymized','kept','pending')),
 keep_until INTEGER,
 basis TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(receipt_id,category)
);
-- Finance archive audit: a payment to the budget or a payment for the service is tied to a bank operation number, so
-- a repeated entry of the same payment is refused instead of doubling the sum.
ALTER TABLE company_tax_payments ADD COLUMN bank_ref TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX company_tax_payments_bank ON company_tax_payments(bank_ref,tax) WHERE bank_ref<>'';
ALTER TABLE owner_balance_entries ADD COLUMN bank_ref TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX owner_balance_entries_bank ON owner_balance_entries(bank_ref) WHERE bank_ref<>'';
-- A company cost reaches the cash flow only when it was really paid.
CREATE TABLE company_cost_payments (
 id TEXT PRIMARY KEY,
 cost_id TEXT NOT NULL REFERENCES company_costs(id),
 month TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000000000),
 bank_ref TEXT NOT NULL UNIQUE CHECK(length(bank_ref) BETWEEN 1 AND 80),
 note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX company_cost_payments_month ON company_cost_payments(month);
