import test from "node:test";
import assert from "node:assert/strict";
import {
  recognise,
  merchantIdentity,
  effectFor,
  kindMatchesDirection,
} from "../src/lib/recognition";
test("Structured Slice bank envelopes preserve merchant boundaries and extract only the VPA", () => {
  const e = merchantIdentity(
    "UPI-Debit-123456789012-NANDINI-YESB0YBLUPI-q12345@ybl",
  );
  assert.equal(e.name, "NANDINI");
  assert.deepEqual(e.upi, ["q12345@ybl"]);
});
test("All requested merchant entities resolve from bank metadata with correct categories", () => {
  for (const [name, kind, subcategory] of [
    ["IRCTC", "TRAVEL", "Train"],
    ["NANDINI", "GROCERIES", "Dairy"],
    ["SWIGGY", "FOOD_DELIVERY", "Food Delivery"],
    ["ZOMATO", "FOOD_DELIVERY", "Food Delivery"],
    ["AMAZON", "PURCHASE", "Online Shopping"],
    ["FLIPKART", "PURCHASE", "Online Shopping"],
    ["NETFLIX", "SUBSCRIPTION", "Entertainment"],
    ["SPOTIFY", "SUBSCRIPTION", "Entertainment"],
  ]) {
    const r = recognise(
      `UPI-Debit-123456789012-${name}-HDFC0MERUPI-payee@hdfcbank-payment`,
      "EXPENSE",
    );
    assert.equal(r.kind, kind, name);
    assert.equal(r.subcategory, subcategory, name);
    assert.equal(r.review, false, name);
  }
});
test("Product-specific payment metadata prevents brand-only spending guesses", () => {
  assert.equal(
    recognise(
      "UPI-Debit-123456789012-Swiggy Instamart-ICIC-swiggyinstamart@icici-paid",
      "EXPENSE",
    ).kind,
    "GROCERIES",
  );
  const wallet = recognise(
    "UPI-Debit-123456789012-Amazon Pay Balance-UTIB-amazonpaybalanceload@apl-request",
    "EXPENSE",
  );
  assert.equal(wallet.effect, "NEUTRAL");
  assert.equal(wallet.review, true);
  const spotify = recognise(
    "UPI-Credit-123456789012-SPOTIFY INDIA PVT LT-HDFC-spotify.bdsi@hdfcbank-mandate Refund Test",
    "INCOME",
  );
  assert.equal(spotify.merchant, "Spotify");
  assert.equal(spotify.effect, "NEUTRAL");
  assert.equal(spotify.kind, "REFUND");
});
test("Payment provider alone does not prove a merchant or income", () => {
  const r = recognise(
    "UPI Credit-FICTIONAL PERSON-person123@amazonpay",
    "INCOME",
  );
  assert.notEqual(r.merchant, "Amazon");
  assert.equal(r.effect, "NEUTRAL");
  assert.equal(r.review, true);
});
test("User corrections and exact UPI identity override defaults only in their recorded direction", () => {
  const learned = [
    {
      identity: "upi:swiggyupi@axb",
      direction: "EXPENSE",
      merchant: "Confirmed campus merchant",
      kind: "GROCERIES",
      categoryId: "owned",
      subcategory: "Campus",
      effect: "EXPENSE",
    },
  ];
  const debit = recognise("swiggyupi@axb", "EXPENSE", "", learned);
  assert.equal(debit.kind, "GROCERIES");
  assert.equal(debit.confidence, "USER");
  assert.equal(debit.categoryId, "owned");
  assert.equal(
    recognise("swiggyupi@axb", "INCOME", "", learned).effect,
    "NEUTRAL",
  );
});
test("Existing user-defined rules are retained and unknown people remain reviewable", () => {
  const r = recognise(
    "Campus book shop",
    "EXPENSE",
    "",
    [],
    [{ keyword: "campus book", categoryId: "books", type: "EXPENSE" }],
  );
  assert.equal(r.categoryId, "books");
  assert.equal(r.confidence, "USER");
  assert.equal(
    recognise("UPI Debit-Fictional Person-1234@okaxis", "EXPENSE").effect,
    "NEUTRAL",
  );
});
test("Financial purpose and cash direction are separate", () => {
  for (const kind of [
    "OWN_TRANSFER",
    "PERSONAL_TRANSFER",
    "CARD_REPAYMENT",
    "CASH_WITHDRAWAL",
    "INVESTMENT",
    "UNKNOWN",
    "REFUND",
    "REVERSAL",
  ] as const) {
    assert.equal(effectFor(kind, "INCOME"), "NEUTRAL");
    assert.equal(effectFor(kind, "EXPENSE"), "NEUTRAL");
  }
  assert.equal(
    recognise("Interest Cr. for 31-Mar-2026", "INCOME").kind,
    "INTEREST",
  );
  assert.equal(recognise("Salary payroll April", "INCOME").effect, "INCOME");
  assert.equal(recognise("ATM cash withdrawal", "EXPENSE").effect, "NEUTRAL");
  assert.equal(recognise("Bank service charge", "EXPENSE").effect, "EXPENSE");
});

test("Explicit classifications cannot contradict the preserved bank direction", () => {
  assert.equal(kindMatchesDirection("SALARY", "EXPENSE"), false);
  assert.equal(kindMatchesDirection("PURCHASE", "INCOME"), false);
  assert.equal(kindMatchesDirection("REVERSAL", "EXPENSE"), false);
  assert.equal(kindMatchesDirection("OWN_TRANSFER", "INCOME"), true);
});
