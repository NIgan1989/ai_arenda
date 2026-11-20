-- Proof that a participant accepted a document of the service (lib/legal-acceptance.ts): who, which document, which
-- edition, when and from which client. The Law «О персональных данных» (art. 25 p. 2 sp. 5) asks the operator to prove
-- consent; the offers to owners and cleaners carry the service's fees. One row per document and edition; a new edition
-- is a new row, older rows stay as history.
CREATE TABLE legal_acceptances (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES profiles(id),
 document TEXT NOT NULL CHECK(document IN ('terms','consent','owner','cleaner')),
 edition TEXT NOT NULL,
 client TEXT NOT NULL CHECK(client IN ('web','mobile')),
 accepted_at INTEGER NOT NULL,
 UNIQUE(user_id,document,edition)
);
CREATE TRIGGER account_erased_legal_acceptances_insert BEFORE INSERT ON legal_acceptances WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
CREATE TRIGGER account_erased_legal_acceptances_update BEFORE UPDATE ON legal_acceptances WHEN EXISTS(SELECT 1 FROM account_erasure_fences WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_erased'); END;
