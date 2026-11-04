import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  analyseSlice,
  sliceDate,
  sliceHeader,
  reversalCandidates,
  sliceIdentity,
  sliceDuplicate,
} from "../src/lib/slice";
import { readStatement } from "../src/lib/statement-files";
const header = [
  "DATE",
  "DETAILS",
  "REF NO.",
  "TRANSACTION TYPE",
  "DEBIT",
  "CREDIT",
  "BALANCE",
];
const debit = [
  "01 Apr '26",
  "UPI/123456789012/Campus cafe",
  " 0000123 ",
  "UPI",
  "100.25",
  "",
  "899.75",
];
const refund = [
  "01 Apr '26",
  "UPI reversal reference number 123456789012",
  "0000456",
  "UPI REVERSAL",
  "",
  "100.25",
  "1000.00",
];
test("Slice finds shifted labels, ignores metadata, preserves references, and calculates paise", () => {
  const s = analyseSlice([
    ["Fictional account metadata"],
    [],
    [],
    header,
    debit,
    refund,
    ["Closing balance", "", "", "", "", "", "1000"],
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.opening, 100000);
  assert.equal(s.closing, 100000);
  assert.equal(s.outgoing, 10025);
  assert.equal(s.incoming, 10025);
  assert.deepEqual(s.errors, []);
  assert.equal(s.rows[0].reference, " 0000123 ");
  assert.equal(s.rows[0].order, 5);
  assert.equal(sliceHeader([[], header]), 1);
  assert.equal(s.from, "2026-04-01");
  assert.equal(s.to, "2026-04-01");
});
test("Slice dates are explicit, calendar-valid and independent of machine timezone", () => {
  assert.equal(sliceDate("31 Dec ’29"), "2029-12-31");
  assert.equal(sliceDate("01 Jan 2030"), "2030-01-01");
  assert.throws(() => sliceDate("31 Feb '26"));
  assert.throws(() => sliceDate("01/04/26"));
});
test("Slice rejects broken balances, invalid amounts, reverse order, and unsafe references", () => {
  assert.match(
    analyseSlice([header, debit, [...refund.slice(0, 6), "999"]]).errors.join(
      " ",
    ),
    /Running balance/,
  );
  assert.match(
    analyseSlice([
      header,
      [...debit.slice(0, 4), "10", "10", "100"],
    ]).errors.join(" "),
    /exactly one/,
  );
  assert.ok(
    analyseSlice([header, debit, ["bad", ...refund.slice(1)]]).errors.length,
  );
  assert.ok(
    analyseSlice([header, debit, ["31 Mar '26", ...refund.slice(1)]]).errors
      .length,
  );
  assert.ok(
    analyseSlice([
      header,
      [
        debit[0],
        debit[1],
        "[Unsafe numeric reference: use text cells]",
        ...debit.slice(3),
      ],
    ]).errors.length,
  );
});
test("Slice duplicate rows do not break the balance chain or inflate movement totals", () => {
  const s = analyseSlice([header, debit, debit, refund]);
  assert.deepEqual(s.errors, []);
  assert.equal(s.outgoing, 10025);
  assert.equal(s.count, 3);
  assert.equal(sliceIdentity(s.rows[0]), sliceIdentity(s.rows[1]));
  assert.notEqual(
    sliceIdentity({ ...s.rows[0], reference: "" }),
    sliceIdentity({ ...s.rows[0], reference: "", balance: 80000 }),
  );
});
test("UPI reversals require explicit reference, direction, date, and full amount evidence", () => {
  const s = analyseSlice([header, debit, refund]);
  const original = {
    id: "one",
    type: "EXPENSE",
    date: "2026-04-01",
    amount: 10025,
    description: debit[1],
    reference: debit[2],
  };
  assert.equal(reversalCandidates(s.rows[1], [original]).length, 1);
  assert.equal(
    reversalCandidates({ ...s.rows[1], description: "UPI reversal 100.25" }, [
      original,
    ]).length,
    0,
  );
  assert.equal(
    reversalCandidates(s.rows[1], [
      { ...original, description: "Unrelated debit", reference: "different" },
    ]).length,
    0,
  );
  assert.equal(
    reversalCandidates(s.rows[1], [{ ...original, amount: 10024 }]).length,
    0,
  );
  assert.equal(
    reversalCandidates(s.rows[1], [{ ...original, date: "2026-04-02" }]).length,
    0,
  );
  assert.equal(
    reversalCandidates(s.rows[1], [original, { ...original, id: "two" }])
      .length,
    2,
  );
});
test("Reference duplicates are exact, scoped by date/direction/amount, not normalised punctuation", () => {
  const row = analyseSlice([header, debit]).rows[0];
  const existing = {
    id: "x",
    date: row.date,
    amount: row.debit,
    type: "EXPENSE",
    description: row.description,
    reference: row.reference,
  };
  assert.equal(sliceDuplicate(row, existing), true);
  assert.equal(
    sliceDuplicate(row, { ...existing, reference: "0000123" }),
    false,
  );
  assert.equal(sliceDuplicate(row, { ...existing, type: "INCOME" }), false);
});
test("XLSX Statement sheet auto-detection supports more than 500 dynamic rows and other sheets", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Instructions").addRow(["Fictional only"]);
  const sheet = book.addWorksheet("Statement");
  for (let i = 0; i < 17; i++) sheet.addRow(["Fictional metadata"]);
  sheet.addRow(header);
  for (let i = 0; i < 573; i++)
    sheet.addRow([
      "02 May '28",
      `Merchant ${i}`,
      `000-${i}`,
      "UPI",
      "1.01",
      "",
      ((900000 - (i + 1) * 101) / 100).toFixed(2),
    ]);
  const buffer = await book.xlsx.writeBuffer();
  const file = new File([new Uint8Array(buffer)], "arbitrary-future-name.xlsx");
  const result = await readStatement(file);
  assert.equal(result.slice?.count, 573);
  assert.equal(result.slice?.opening, 900000);
  assert.equal(result.slice?.closing, 842127);
  assert.deepEqual(result.slice?.errors, []);
  assert.equal(result.slice?.rows[0].reference, "000-0");
});

test("Original description whitespace and bank-prefixed reference evidence are preserved", () => {
  const description = "  UPI-Debit-123456789012-IRCTC-HDFC-irctc@hdfcbank  ";
  const s = analyseSlice([
    header,
    ["01 Apr \'26", description, "original", "DEBIT", "100", "", "900"],
    [
      "02 Apr \'26",
      "UPI reversal reference number 123456789012",
      "refund",
      "CREDIT",
      "",
      "100",
      "1000",
    ],
  ]);
  assert.equal(s.rows[0].description, description);
  assert.equal(
    reversalCandidates(s.rows[1], [
      {
        id: "one",
        description,
        reference: "original",
        date: "2026-04-01",
        type: "EXPENSE",
        amount: 10000,
      },
    ]).length,
    1,
  );
});
