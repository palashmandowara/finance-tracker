import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  csv,
  csvCell,
  parseDate,
  statementAmount,
  parseStatementRow,
  suggest,
  duplicate,
  transferSchema,
  type Mapping,
} from "../src/lib/statements";
import { readStatement } from "../src/lib/statement-files";
const mapping: Mapping = {
  date: 0,
  description: 1,
  debit: 2,
  credit: 3,
  reference: 4,
  amount: -1,
  type: -1,
  mode: "split",
  dateFormat: "DMY",
  positive: "INCOME",
};
test("statement dates require explicit format, reject impossible dates and two digit years", () => {
  assert.equal(parseDate("02/11/2026", "DMY"), "2026-11-02");
  assert.equal(parseDate("02/11/2026", "MDY"), "2026-02-11");
  assert.equal(parseDate("31/02/2026", "DMY"), "");
  assert.equal(parseDate("2/11/26", "DMY"), "");
});
test("statement money is exact paise and sign convention is explicit", () => {
  assert.equal(statementAmount("₹1,234.50"), 123450);
  assert.throws(() => statementAmount("1.234"));
  assert.throws(() => statementAmount("1e4"));
  const row = parseStatementRow(["2026-11-02", "Purchase", "-12.34"], 0, {
    ...mapping,
    dateFormat: "YMD",
    mode: "signed",
    amount: 2,
    positive: "INCOME",
  });
  assert.equal(row.amount, "12.34");
  assert.equal(row.type, "EXPENSE");
  assert.equal(
    parseStatementRow(["2026-11-02", "Purchase", "12.34"], 0, {
      ...mapping,
      dateFormat: "YMD",
      mode: "signed",
      amount: 2,
      positive: "EXPENSE",
    }).type,
    "EXPENSE",
  );
});
test("headings, balances, totals, zero/both-sided and conflicting rows cannot be silently imported", () => {
  assert.equal(
    parseStatementRow(["", "Closing balance", "5000"], 0, mapping).blocked,
    true,
  );
  assert.equal(
    parseStatementRow(["Date", "Description", "Debit", "Credit"], 0, mapping)
      .blocked,
    true,
  );
  assert.ok(
    parseStatementRow(["02/11/2026", "Purchase", "50", "30"], 0, mapping).error,
  );
  assert.ok(
    parseStatementRow(["02/11/2026", "Purchase", "50", "", "INCOME"], 0, {
      ...mapping,
      type: 4,
    }).error,
  );
});
test("user categorisation rules override defaults and uncertain matches remain blank", () => {
  const cats = [
    { id: "food", name: "Groceries", type: "EXPENSE" },
    { id: "other", name: "Other", type: "EXPENSE" },
  ];
  assert.equal(suggest("Campus groceries", "EXPENSE", cats, []), "food");
  assert.equal(
    suggest("Campus groceries", "EXPENSE", cats, [
      { keyword: "campus", categoryId: "other", type: "EXPENSE" },
    ]),
    "other",
  );
  assert.equal(suggest("Unknown shop", "EXPENSE", cats, []), "");
  assert.equal(suggest("Campus groceries", "INCOME", cats, []), "");
});
test("duplicate matching uses reference or date and normalised description with amount and direction", () => {
  const row = {
    date: "2026-11-02",
    amount: 50000,
    type: "EXPENSE",
    description: "Campus Grocery!",
    reference: "ABC-123",
  };
  assert.ok(duplicate(row, { ...row, description: "Other wording" }));
  assert.ok(
    duplicate(
      { ...row, reference: "" },
      { ...row, description: "campus grocery" },
    ),
  );
  assert.equal(duplicate(row, { ...row, amount: 1 }), false);
  assert.equal(duplicate(row, { ...row, type: "INCOME" }), false);
});
test("CSV escaping handles quotes, commas, newlines and formula prefixes", () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const value of ["=1+1", " +SUM(A1)", "-cmd", "@cmd", "\tformula"])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.ok(csv([["Date"], ["2026-11-02"]]).startsWith("\uFEFF"));
});
test("transfers need distinct accounts and positive integer paise", () => {
  assert.equal(
    transferSchema.safeParse({
      fromId: "a",
      toId: "a",
      amount: "5",
      date: "2026-11-02",
      description: "Move",
    }).success,
    false,
  );
  const result = transferSchema.parse({
    fromId: "a",
    toId: "b",
    amount: "12.34",
    date: "2026-11-02",
    description: "Move",
  });
  assert.equal(result.amount, 1234);
});
test("fictional CSV and XLSX parse identically; oversized and unsupported files are rejected", async () => {
  const csv = await readStatement(
    new File([readFileSync("public/samples/statement.csv")], "demo.csv"),
  );
  const xlsx = await readStatement(
    new File([readFileSync("public/samples/statement.xlsx")], "demo.xlsx"),
  );
  assert.deepEqual(csv, xlsx);
  await assert.rejects(() => readStatement(new File(["x"], "demo.pdf")));
  await assert.rejects(() =>
    readStatement(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.csv")),
  );
  await assert.rejects(() =>
    readStatement(
      new File(["a,b\n" + Array(501).fill("x,y").join("\n")], "many.csv"),
    ),
  );
});
