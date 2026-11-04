ALTER TABLE "Transaction" ADD COLUMN "classification" JSONB, ADD COLUMN "accountingEffect" TEXT;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountingEffect_check" CHECK ("accountingEffect" IS NULL OR "accountingEffect" IN ('INCOME','EXPENSE','NEUTRAL'));
ALTER TABLE "SliceEntry" ADD COLUMN "source" JSONB;
CREATE TABLE "MerchantClassification" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,"identity" TEXT NOT NULL,"direction" TEXT NOT NULL,"merchant" TEXT NOT NULL,"kind" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"subcategory" TEXT NOT NULL,"effect" TEXT NOT NULL);
CREATE UNIQUE INDEX "MerchantClassification_userId_identity_direction_key" ON "MerchantClassification"("userId","identity","direction");
