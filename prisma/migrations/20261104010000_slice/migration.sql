ALTER TABLE "Transaction" ADD COLUMN "reversalOfId" TEXT;
CREATE UNIQUE INDEX "Transaction_reversalOfId_key" ON "Transaction"("reversalOfId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SliceEntry" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "key" TEXT NOT NULL,
 "sourceOrder" INTEGER NOT NULL, "balance" INTEGER NOT NULL, "date" DATE NOT NULL,
 "transactionId" TEXT, "transferId" TEXT,
 CONSTRAINT "SliceEntry_accountId_userId_fkey" FOREIGN KEY ("accountId","userId") REFERENCES "FinancialAccount"("id","userId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SliceEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SliceEntry_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SliceEntry_one_record" CHECK (("transactionId" IS NULL) <> ("transferId" IS NULL))
);
CREATE UNIQUE INDEX "SliceEntry_userId_accountId_key_key" ON "SliceEntry"("userId","accountId","key");
CREATE INDEX "SliceEntry_transactionId_idx" ON "SliceEntry"("transactionId");
CREATE INDEX "SliceEntry_transferId_idx" ON "SliceEntry"("transferId");
-- A matched pair must retain its cash direction, account and full amount. Category/description edits remain allowed.
CREATE FUNCTION guard_slice_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "Transaction"; refund "Transaction";
BEGIN
 IF NEW."reversalOfId" IS NOT NULL THEN
  SELECT * INTO original FROM "Transaction" WHERE id=NEW."reversalOfId";
  IF original.id IS NULL OR original."userId" <> NEW."userId" OR original."accountId" <> NEW."accountId" OR original.type <> 'EXPENSE' OR NEW.type <> 'INCOME' OR original.amount <> NEW.amount OR original.date > NEW.date THEN
   RAISE EXCEPTION 'Invalid reversal pair';
  END IF;
 END IF;
 SELECT * INTO refund FROM "Transaction" WHERE "reversalOfId"=NEW.id;
 IF refund.id IS NOT NULL AND (NEW.type <> 'EXPENSE' OR NEW.amount <> refund.amount OR NEW."accountId" <> refund."accountId" OR NEW.date > refund.date) THEN
  RAISE EXCEPTION 'A matched reversal prevents changing this payment amount, account, type or date';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER slice_reversal_guard BEFORE INSERT OR UPDATE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION guard_slice_reversal();

ALTER TABLE "Transaction" ALTER COLUMN "reference" TYPE VARCHAR(500), ADD COLUMN "sourceOrder" INTEGER;
ALTER TABLE "Transfer" ALTER COLUMN "reference" TYPE VARCHAR(500), ADD COLUMN "sourceOrder" INTEGER;
