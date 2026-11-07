-- Ledger invariants enforced in the database, not only in application code.
-- 1) Every transaction must sum to zero (checked at COMMIT, so entries can be inserted one by one).
CREATE OR REPLACE FUNCTION money.assert_txn_balanced() RETURNS trigger AS $$
DECLARE total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_centimes), 0) INTO total FROM money.ledger_entry WHERE txn_id = NEW.txn_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger txn % is unbalanced by % centimes', NEW.txn_id, total USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entry_balanced
  AFTER INSERT ON money.ledger_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION money.assert_txn_balanced();
--> statement-breakpoint
-- 2) The ledger is append-only.
CREATE OR REPLACE FUNCTION money.forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'money.ledger_entry is append-only' USING ERRCODE = '42501';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entry_immutable
  BEFORE UPDATE OR DELETE ON money.ledger_entry
  FOR EACH ROW EXECUTE FUNCTION money.forbid_ledger_mutation();
--> statement-breakpoint
-- 3) Audit log is append-only too.
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON platform.audit_log
  FOR EACH ROW EXECUTE FUNCTION money.forbid_ledger_mutation();
--> statement-breakpoint
-- 4) Reviews only for settled/confirmed jobs by participants is enforced in the app; here we guard rating range.
ALTER TABLE booking.review ADD CONSTRAINT review_rating_range CHECK (rating BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE booking.booking ADD CONSTRAINT booking_amounts_nonneg CHECK (total_centimes >= 0 AND fee_centimes >= 0 AND fee_centimes <= total_centimes);
