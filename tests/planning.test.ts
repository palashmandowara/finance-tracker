import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetUsage,
  comparison,
  currentMonth,
  indiaToday,
  monthRange,
  shiftMonth,
} from "../src/lib/months";
import {
  budgetSchema,
  goalSchema,
  contributionSchema,
  monthSchema,
} from "../src/lib/planning-validation";
import { transactionSchema } from "../src/lib/validation";
test("Kolkata midnight changes month at 18:30 UTC, not UTC midnight", () => {
  assert.equal(currentMonth(new Date("2026-10-31T18:29:59Z")), "2026-10");
  assert.equal(currentMonth(new Date("2026-10-31T18:30:00Z")), "2026-11");
  assert.equal(indiaToday(new Date("2026-12-31T18:30:00Z")), "2027-01-01");
});
test("date-only month windows are half-open and current month is MTD", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const previous = monthRange("2026-10", now);
  assert.equal(previous.gte.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(previous.lt.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(
    monthRange("2026-11", now).lt.toISOString(),
    "2026-11-04T00:00:00.000Z",
  );
  assert.equal(
    monthRange("2024-02", now).lt.toISOString(),
    "2024-03-01T00:00:00.000Z",
  );
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
test("budget thresholds use exact integer amounts, not rounded percentages", () => {
  assert.equal(budgetUsage(7999, 10000).status, "On track");
  assert.equal(budgetUsage(8000, 10000).status, "Approaching limit");
  assert.equal(budgetUsage(10000, 10000).status, "At budget");
  assert.deepEqual(budgetUsage(10001, 10000), {
    remaining: -1,
    percent: 100.01,
    status: "Over budget",
  });
  assert.equal(budgetUsage(0, 1).percent, 0);
});
test("comparisons handle zero and negative baselines without Infinity or NaN", () => {
  assert.deepEqual(comparison(100, 0), { delta: 100, percent: null });
  assert.deepEqual(comparison(0, 0), { delta: 0, percent: null });
  assert.deepEqual(comparison(0, 100), { delta: -100, percent: -100 });
  assert.deepEqual(comparison(-50, -100), { delta: 50, percent: 50 });
});
test("planning inputs reject bad dates, non-positive money and invalid months", () => {
  for (const month of ["2026-00", "2026-13", "26-11", "9999-12"])
    assert.equal(monthSchema.safeParse(month).success, false);
  assert.equal(
    budgetSchema.parse({ month: "2026-11", categoryId: "", amount: "1000.01" })
      .amount,
    100001,
  );
  assert.equal(
    budgetSchema.safeParse({ month: "2026-11", categoryId: "", amount: "0" })
      .success,
    false,
  );
  assert.equal(
    goalSchema.parse({ name: "Trip", target: "100", deadline: "" }).target,
    10000,
  );
  assert.equal(
    goalSchema.safeParse({
      name: "Trip",
      target: "100",
      deadline: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    contributionSchema.safeParse({ goalId: "g", amount: "-1" }).success,
    false,
  );
  assert.equal(
    contributionSchema.safeParse({ goalId: "g", amount: "0.001" }).success,
    false,
  );
});
test("transfers and credit-card repayments cannot enter the expense ledger", () => {
  for (const type of ["TRANSFER", "CREDIT_CARD_REPAYMENT"])
    assert.equal(
      transactionSchema.safeParse({
        type,
        description: "Excluded",
        amount: "100",
        accountId: "a",
        categoryId: "c",
        date: "2026-11-01",
      }).success,
      false,
    );
});
