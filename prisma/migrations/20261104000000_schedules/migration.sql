CREATE TABLE "Subscription" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"name" TEXT NOT NULL,"merchant" TEXT NOT NULL,"amount" INTEGER NOT NULL CHECK("amount">0),"frequency" TEXT NOT NULL CHECK("frequency" IN ('MONTHLY','YEARLY')),"nextRenewal" DATE NOT NULL,"accountId" TEXT,"categoryId" TEXT,"paused" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE TABLE "SubscriptionDismissal" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"merchant" TEXT NOT NULL);
CREATE UNIQUE INDEX "SubscriptionDismissal_userId_merchant_key" ON "SubscriptionDismissal"("userId","merchant");
CREATE TABLE "Bill" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"title" TEXT NOT NULL,"amount" INTEGER NOT NULL CHECK("amount">0),"kind" TEXT NOT NULL CHECK("kind" IN ('CREDIT_CARD','RENT','EMI','UTILITY','OTHER')),"accountId" TEXT,"recurrence" TEXT NOT NULL CHECK("recurrence" IN ('ONCE','MONTHLY','YEARLY')),"startDate" DATE NOT NULL,"paused" BOOLEAN NOT NULL DEFAULT false,"subscriptionId" TEXT REFERENCES "Subscription"("id") ON DELETE SET NULL);
CREATE UNIQUE INDEX "Bill_subscriptionId_key" ON "Bill"("subscriptionId");CREATE INDEX "Bill_userId_idx" ON "Bill"("userId");
CREATE TABLE "BillOccurrence" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"billId" TEXT NOT NULL REFERENCES "Bill"("id") ON DELETE CASCADE,"title" TEXT NOT NULL,"kind" TEXT NOT NULL,"amount" INTEGER NOT NULL CHECK("amount">0),"accountId" TEXT,"scheduledDate" DATE NOT NULL,"dueDate" DATE NOT NULL,"cancelled" BOOLEAN NOT NULL DEFAULT false);
CREATE UNIQUE INDEX "BillOccurrence_billId_scheduledDate_key" ON "BillOccurrence"("billId","scheduledDate");CREATE INDEX "BillOccurrence_userId_dueDate_idx" ON "BillOccurrence"("userId","dueDate");
CREATE TABLE "BillPayment" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"occurrenceId" TEXT NOT NULL REFERENCES "BillOccurrence"("id") ON DELETE CASCADE,"transactionId" TEXT REFERENCES "Transaction"("id") ON DELETE SET NULL,"transferId" TEXT REFERENCES "Transfer"("id") ON DELETE SET NULL,"recordId" TEXT NOT NULL,"amount" INTEGER NOT NULL CHECK("amount">0),"paymentDate" DATE NOT NULL,"valid" BOOLEAN NOT NULL DEFAULT true,"note" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "BillPayment_one_record" CHECK(NOT("transactionId" IS NOT NULL AND "transferId" IS NOT NULL)));
CREATE UNIQUE INDEX "BillPayment_transactionId_key" ON "BillPayment"("transactionId");CREATE UNIQUE INDEX "BillPayment_transferId_key" ON "BillPayment"("transferId");CREATE UNIQUE INDEX "BillPayment_active_occurrence" ON "BillPayment"("occurrenceId") WHERE "valid";
CREATE INDEX "BillPayment_occurrenceId_idx" ON "BillPayment"("occurrenceId");CREATE INDEX "BillPayment_userId_idx" ON "BillPayment"("userId");
-- History survives financial-record edits/deletion; the derived occurrence status becomes unpaid.
CREATE FUNCTION invalidate_bill_expense() RETURNS trigger AS $$ BEGIN
 IF TG_OP='DELETE' THEN
 UPDATE "BillPayment" SET "valid"=false,"transactionId"=NULL,"note"='Linked expense deleted; payment needs review' WHERE "transactionId"=OLD.id;
 RETURN OLD;
 END IF;
 IF (NEW.amount,NEW.type,NEW."accountId",NEW.date) IS DISTINCT FROM (OLD.amount,OLD.type,OLD."accountId",OLD.date) THEN
 UPDATE "BillPayment" SET "valid"=false,"transactionId"=NULL,"note"='Linked expense changed; payment needs review' WHERE "transactionId"=OLD.id;
 END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "bill_expense_changed" BEFORE UPDATE OR DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION invalidate_bill_expense();
CREATE FUNCTION invalidate_bill_transfer() RETURNS trigger AS $$ BEGIN
 IF TG_OP='DELETE' THEN
 UPDATE "BillPayment" SET "valid"=false,"transferId"=NULL,"note"='Linked transfer deleted; payment needs review' WHERE "transferId"=OLD.id; RETURN OLD;
 END IF;
 IF (NEW.amount,NEW."fromId",NEW."toId",NEW.date) IS DISTINCT FROM (OLD.amount,OLD."fromId",OLD."toId",OLD.date) THEN
 UPDATE "BillPayment" SET "valid"=false,"transferId"=NULL,"note"='Linked transfer changed; payment needs review' WHERE "transferId"=OLD.id;
 END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "bill_transfer_changed" BEFORE UPDATE OR DELETE ON "Transfer" FOR EACH ROW EXECUTE FUNCTION invalidate_bill_transfer();
