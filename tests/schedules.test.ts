import test from "node:test";
import assert from "node:assert/strict";
import {
  recurrenceDate,
  scheduleDates,
  estimatedCosts,
  eventStatus,
  detectSubscriptions,
  subscriptionSchema,
  billSchema,
} from "../src/lib/schedules";
import { indiaToday } from "../src/lib/months";
test("monthly recurrence preserves month-end anchor after short months", () => {
  assert.equal(recurrenceDate("2027-01-31", "MONTHLY", 1), "2027-02-28");
  assert.equal(recurrenceDate("2027-01-31", "MONTHLY", 2), "2027-03-31");
  assert.equal(recurrenceDate("2028-01-31", "MONTHLY", 1), "2028-02-29");
  assert.deepEqual(
    scheduleDates("2027-01-31", "MONTHLY", "2027-02-01", "2027-03-31"),
    ["2027-02-28", "2027-03-31"],
  );
});
test("yearly leap-day renewal restores Feb 29 in leap years", () => {
  assert.equal(recurrenceDate("2024-02-29", "YEARLY", 1), "2025-02-28");
  assert.equal(recurrenceDate("2024-02-29", "YEARLY", 4), "2028-02-29");
  assert.deepEqual(
    scheduleDates("2026-11-04", "ONCE", "2026-01-01", "2027-12-31"),
    ["2026-11-04"],
  );
});
test("renewal estimates remain integer paise and calendar status uses Kolkata date", () => {
  assert.deepEqual(estimatedCosts(10000, "YEARLY"), {
    annual: 10000,
    monthly: 833,
  });
  assert.deepEqual(estimatedCosts(9999, "MONTHLY"), {
    annual: 119988,
    monthly: 9999,
  });
  const today = indiaToday(new Date("2026-11-03T18:30:00Z"));
  assert.equal(today, "2026-11-04");
  assert.equal(eventStatus("2026-11-03", false, today), "Overdue");
  assert.equal(eventStatus(today, false, today), "Due today");
  assert.equal(eventStatus("2026-11-05", false, today), "Upcoming");
  assert.equal(eventStatus("2026-11-03", true, today), "Paid");
});
test("recurring suggestions need evidence and exclude tracked or dismissed merchants", () => {
  const records = ["2026-08-31", "2026-09-30", "2026-10-31"].map((date, i) => ({
    id: String(i),
    date,
    description: "Stream Club " + i,
    amount: 19900,
    accountId: "a",
    categoryId: "c",
  }));
  const found = detectSubscriptions(records, []);
  assert.equal(found.length, 1);
  assert.equal(found[0].frequency, "MONTHLY");
  assert.equal(found[0].evidence.length, 3);
  assert.equal(detectSubscriptions(records, ["stream club"]).length, 0);
  assert.equal(detectSubscriptions(records.slice(0, 2), []).length, 0);
  assert.equal(
    detectSubscriptions(
      records.map((r, i) => ({ ...r, amount: (i + 1) * 19900 })),
      [],
    ).length,
    0,
  );
  assert.equal(
    detectSubscriptions(
      [
        { ...records[0], date: "2025-01-01" },
        { ...records[1], date: "2026-01-01" },
      ],
      [],
    )[0].frequency,
    "YEARLY",
  );
});
test("schedule validation rejects invalid amounts, dates and unsupported frequencies", () => {
  assert.equal(
    subscriptionSchema.safeParse({
      name: "Plan",
      amount: "0",
      frequency: "MONTHLY",
      nextRenewal: "2026-11-04",
    }).success,
    false,
  );
  assert.equal(
    billSchema.safeParse({
      title: "Rent",
      amount: "500",
      kind: "RENT",
      recurrence: "WEEKLY",
      startDate: "2026-11-04",
    }).success,
    false,
  );
  assert.equal(
    billSchema.safeParse({
      title: "Rent",
      amount: "500",
      kind: "RENT",
      recurrence: "MONTHLY",
      startDate: "2026-02-30",
    }).success,
    false,
  );
});
