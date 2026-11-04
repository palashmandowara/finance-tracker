import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toPaise,
  money,
  accountSchema,
  transactionSchema,
  dateOnly,
  filtersSchema,
} from "../src/lib/validation";
import { balance, inr } from "../src/lib/money";
test("money is parsed exactly in integer paise", () => {
  assert.equal(toPaise("0.29"), 29);
  assert.equal(toPaise("100.1"), 10010);
  assert.equal(toPaise("-12.34"), -1234);
  assert.equal(money.parse("21474836.47"), 2147483647);
  for (const value of [
    "0",
    "-1",
    "1.001",
    "1e3",
    "NaN",
    "21474836.48",
    "Infinity",
  ])
    assert.equal(money.safeParse(value).success, false, value);
});
test("opening debt is allowed but overflow is rejected", () => {
  assert.equal(
    accountSchema.parse({
      name: "Card",
      type: "CREDIT_CARD",
      openingBalance: "-1500.01",
    }).openingBalance,
    -150001,
  );
  assert.equal(
    accountSchema.safeParse({
      name: "Card",
      type: "CREDIT_CARD",
      openingBalance: "-21474836.48",
    }).success,
    false,
  );
});
test("calendar dates and date ranges are validated", () => {
  assert.equal(dateOnly.safeParse("2024-02-29").success, true);
  for (const value of ["2025-02-29", "2026-04-31", "2026-13-01", "not-a-date"])
    assert.equal(dateOnly.safeParse(value).success, false);
  assert.equal(
    filtersSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success,
    false,
  );
});
test("transfers cannot be submitted as income or expense", () => {
  const data = {
    description: "Lunch",
    amount: "50.50",
    accountId: "a",
    categoryId: "c",
    date: "2026-01-01",
    type: "EXPENSE",
  };
  assert.equal(transactionSchema.parse(data).amount, 5050);
  assert.equal(
    transactionSchema.safeParse({ ...data, type: "TRANSFER" }).success,
    false,
  );
  assert.equal(
    transactionSchema.safeParse({ ...data, categoryId: "" }).success,
    false,
  );
});
test("balance includes opening balance once and display uses INR", () => {
  assert.equal(balance(10000, 5000, 2500), 12500);
  assert.equal(balance(-10000, 5000, 2500), -7500);
  assert.match(inr(123456), /1,234\.56/);
});
