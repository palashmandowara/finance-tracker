-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "scope" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryType" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "deadline" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_categoryId_userId_categoryType_idx" ON "Budget"("categoryId", "userId", "categoryType");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_month_scope_key" ON "Budget"("userId", "month", "scope");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_createdAt_idx" ON "SavingsGoal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsGoal_id_userId_key" ON "SavingsGoal"("id", "userId");

-- CreateIndex
CREATE INDEX "GoalContribution_goalId_userId_idx" ON "GoalContribution"("goalId", "userId");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_userId_categoryType_fkey" FOREIGN KEY ("categoryId", "userId", "categoryType") REFERENCES "Category"("id", "userId", "type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_userId_fkey" FOREIGN KEY ("goalId", "userId") REFERENCES "SavingsGoal"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints apply only to new tables. Existing rows and tables are unchanged.
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_scope_matches_category" CHECK ("scope" = COALESCE("categoryId", 'overall'));
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_expense_only" CHECK ("categoryType" = 'EXPENSE');
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_valid_month" CHECK ("month" ~ '^(19[0-9]{2}|[2-9][0-9]{3})-(0[1-9]|1[0-2])$' AND "month" <= '9998-12');
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_target_positive" CHECK ("target" > 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_amount_positive" CHECK ("amount" > 0);
