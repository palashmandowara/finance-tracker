import { test, expect, type Page, type Request } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";
import ExcelJS from "exceljs";
const db = new Pool({
  connectionString: parse(readFileSync(".env", "utf8")).DATABASE_URL,
});
const tag = randomBytes(8).toString("hex"),
  password = randomBytes(24).toString("hex");
const emails = [`slice-${tag}-a@example.test`, `slice-${tag}-b@example.test`];
const bank = randomUUID(),
  card = randomUUID(),
  foreign = randomUUID();
let user = "";
const header = [
  "DATE",
  "DETAILS",
  "REF NO.",
  "TRANSACTION TYPE",
  "DEBIT",
  "CREDIT",
  "BALANCE",
];
const first = [
  [
    "01 Apr '26",
    "UPI/123456789012/Cafe",
    " 000001 ",
    "UPI",
    "100.25",
    "",
    "899.75",
  ],
  ["01 Apr '26", "Fictional salary", "000002", "CREDIT", "", "200", "1099.75"],
  [
    "01 Apr '26",
    "UPI reversal reference number 123456789012",
    "000003",
    "UPI REVERSAL",
    "",
    "100.25",
    "1200",
  ],
  [
    "02 Apr '26",
    "UPI/222222222222/Bookshop",
    "000004",
    "UPI",
    "50",
    "",
    "1150",
  ],
  [
    "02 Apr '26",
    "UPI/222222222222/Bookshop",
    "000004",
    "UPI",
    "50",
    "",
    "1150",
  ],
  [
    "03 Apr '26",
    "Self transfer card repayment",
    "000005",
    "DEBIT",
    "200",
    "",
    "950",
  ],
];
async function workbook(rows: string[][], padding = 8) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Statement");
  book.addWorksheet("Notes").addRow(["Fictional test only"]);
  for (let i = 0; i < padding; i++) sheet.addRow(["Anonymous metadata"]);
  sheet.addRow(header);
  rows.forEach((r) => sheet.addRow(r));
  return {
    name: "fictional-variable-statement.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  };
}
async function signup(p: Page, email: string) {
  const r = await p.request.post("/api/auth/sign-up/email", {
    data: { name: "Slice test", email, password },
  });
  expect(r.ok()).toBeTruthy();
}
async function upload(p: Page, rows: string[][], padding = 8) {
  await p.goto("/dashboard/import");
  await p
    .getByLabel("Destination account (for automatic Slice analysis)")
    .selectOption(bank);
  await p
    .getByLabel("Statement file")
    .setInputFiles(await workbook(rows, padding));
  await p.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Import summary", exact: true }),
  ).toBeVisible();
}
async function confirm(p: Page) {
  const pending = p.waitForRequest(
    (r) => r.method() === "POST" && !!r.headers()["next-action"],
  );
  await p
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const req = await pending;
  await expect(p.getByLabel("Slice import result")).toBeVisible();
  return req;
}
async function replay(p: Page, r: Request) {
  return p.request.post("/dashboard/import", {
    headers: {
      "next-action": r.headers()["next-action"],
      "content-type": r.headers()["content-type"],
      origin: "http://localhost:3000",
    },
    data: r.postData()!,
  });
}
async function counts() {
  return (
    await db.query(
      'SELECT count(*)::int AS n FROM "Transaction" WHERE "userId"=$1',
      [user],
    )
  ).rows[0].n;
}
test.afterAll(async () => {
  const ids = (
    await db.query('SELECT id FROM "User" WHERE email=ANY($1::text[])', [
      emails,
    ])
  ).rows.map((r) => r.id);
  await db.query(
    'DELETE FROM "Transaction" WHERE "userId"=ANY($1::text[]) AND "reversalOfId" IS NOT NULL',
    [ids],
  );
  for (const table of [
    "BillPayment",
    "BillOccurrence",
    "Bill",
    "Subscription",
    "SubscriptionDismissal",
    "GoalContribution",
    "SavingsGoal",
    "Budget",
    "MerchantRule",
    "SliceEntry",
    "Transaction",
    "Transfer",
    "ImportBatch",
    "Category",
    "FinancialAccount",
  ])
    await db.query(`DELETE FROM "${table}" WHERE "userId"=ANY($1::text[])`, [
      ids,
    ]);
  await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
  await db.end();
});
test("Slice desktop: automatic summary, reversals, transfers, overlap, replay and ownership", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const ca = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    cb = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  try {
    await signup(a, emails[0]);
    await signup(b, emails[1]);
    user = (await db.query('SELECT id FROM "User" WHERE email=$1', [emails[0]]))
      .rows[0].id;
    const other = (
      await db.query('SELECT id FROM "User" WHERE email=$1', [emails[1]])
    ).rows[0].id;
    await db.query(
      "INSERT INTO \"FinancialAccount\" (id,\"userId\",name,type,\"openingBalance\") VALUES ($1,$2,'Slice test bank','BANK',0),($3,$2,'Slice test card','CREDIT_CARD',-50000),($4,$5,'Private foreign bank','BANK',0)",
      [bank, user, card, foreign, other],
    );
    await upload(a, first);
    await expect(
      a.getByText(
        "6 transactions · 2026-04-01 to 2026-04-03. Header and metadata recognised automatically.",
      ),
    ).toBeVisible();
    await expect(
      a.getByRole("button", { name: "Import statement", exact: true }),
    ).toBeDisabled();
    await a.getByLabel("Row 15 action").selectOption("TRANSFER");
    await a.getByLabel("Row 15 other account").selectOption(card);
    await a.getByRole("checkbox", { name: /Use .*opening balance/ }).check();
    mkdirSync("design/qa", { recursive: true });
    await a.screenshot({
      path: "design/qa/slice-summary-desktop.png",
      fullPage: true,
    });
    await a
      .getByText("Full details & optional category corrections", {
        exact: true,
      })
      .click();
    await a.getByLabel("Row 13 purpose").selectOption("PURCHASE");
    const request = await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Imported: 5 · Skipped: 1 · Reversals: 1",
    );
    await expect(a.getByLabel("Slice import result")).toContainText("₹950.00");
    expect(await counts()).toBe(4);
    expect(
      (
        await db.query(
          'SELECT "openingBalance" FROM "FinancialAccount" WHERE id=$1',
          [bank],
        )
      ).rows[0].openingBalance,
    ).toBe(100000);
    const records = (
      await db.query(
        'SELECT * FROM "Transaction" WHERE "userId"=$1 ORDER BY "sourceOrder"',
        [user],
      )
    ).rows;
    expect(records[0].reference).toBe(" 000001 ");
    expect(records[2].reversalOfId).toBe(records[0].id);
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "Transfer" WHERE "userId"=$1',
          [user],
        )
      ).rows[0].n,
    ).toBe(1);
    await replay(a, request);
    expect(await counts()).toBe(4);
    const denied = await replay(b, request);
    expect(await denied.text()).toContain("Import not found");
    expect(await counts()).toBe(4);
    await a.goto("/dashboard?month=2026-04");
    const totals = a.getByRole("region", { name: "Financial totals" });
    await expect(totals).toContainText("₹200.00");
    await expect(totals).toContainText("₹50.00");
    await expect(totals).toContainText("₹650.00");
    await upload(a, first);
    await expect(a.getByRole("checkbox")).toHaveCount(0);
    await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Imported: 0 · Skipped: 6",
    );
    expect(await counts()).toBe(4);
    const overlap = [
      ...first.slice(1),
      ["04 Apr '26", "Unknown merchant", "000006", "UPI", "25", "", "925"],
      [
        "05 Apr '26",
        "UPI reversal for transaction UPI/222222222222",
        "000007",
        "UPI REVERSAL",
        "",
        "50",
        "975",
      ],
    ];
    await upload(a, overlap, 3);
    await a
      .getByText("Full details & optional category corrections", {
        exact: true,
      })
      .click();
    await a.getByLabel("Row 10 purpose").selectOption("PURCHASE");
    await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Imported: 2 · Skipped: 5 · Reversals: 1",
    );
    expect(await counts()).toBe(6);
    await expect(a.getByLabel("Slice import result")).toContainText("₹975.00");
    expect(
      (
        await db.query(
          'SELECT "openingBalance" FROM "FinancialAccount" WHERE id=$1',
          [bank],
        )
      ).rows[0].openingBalance,
    ).toBe(100000);
    await a.goto("/dashboard?month=2026-04");
    await expect(
      a.getByRole("region", { name: "Financial totals" }),
    ).toContainText("₹25.00");
    const exported = await a.request.get(
      `/dashboard/transactions/export?account=${bank}`,
    );
    expect(exported.ok()).toBeTruthy();
    expect(await exported.text()).toContain("REVERSAL");
    await upload(a, [first[0], [...first[1].slice(0, 6), "42"]]);
    await expect(
      a.getByRole("heading", { name: "Source file needs attention" }),
    ).toBeVisible();
    await expect(
      a.getByRole("button", { name: "Import statement", exact: true }),
    ).toBeDisabled();
    expect(await counts()).toBe(6);
    const invalidBatch = (
      await db.query(
        'SELECT id FROM "ImportBatch" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
        [user],
      )
    ).rows[0].id;
    const forceInvalid = await a.request.post("/dashboard/import", {
      headers: {
        "next-action": request.headers()["next-action"],
        "content-type": request.headers()["content-type"],
        origin: "http://localhost:3000",
      },
      data: JSON.stringify([invalidBatch, [], false]),
    });
    expect(await forceInvalid.text()).toContain("Correct the source file");
    expect(await counts()).toBe(6);
    // A foreign account injected into a browser select must still be rejected by the server.
    await a
      .getByLabel("Destination account", { exact: true })
      .evaluate((e, id) => {
        (e as HTMLSelectElement).add(new Option("Foreign", id));
      }, foreign);
    await a
      .getByLabel("Destination account", { exact: true })
      .selectOption(foreign);
    await a
      .getByRole("button", { name: "Analyse account", exact: true })
      .click();
    await expect(
      a.getByText("Choose an account you own.", { exact: true }),
    ).toBeVisible();
    // Refunds reach monthly budgets too, rather than only the all-time cards.
    await db.query(
      'INSERT INTO "Budget" (id,"userId",month,scope,amount,"updatedAt") VALUES ($1,$2,\'2026-04\',\'overall\',10000,NOW())',
      [randomUUID(), user],
    );
    await a.goto("/dashboard/budgets?month=2026-04");
    await expect(
      a.getByRole("article", { name: "Overall expenses budget" }),
    ).toContainText("₹25.00 spent");
    // Reconcile an already recorded movement when its incoming bank-statement side arrives.
    const secondBank = randomUUID();
    await db.query(
      'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,\'Second fictional bank\',\'BANK\',10000)',
      [secondBank, user],
    );
    await db.query(
      'INSERT INTO "Transfer" (id,"userId","fromId","toId",amount,date,description,reference) VALUES ($1,$2,$3,$4,2500,\'2026-04-08\',\'Self transfer\',\'existing-001\')',
      [randomUUID(), user, secondBank, bank],
    );
    await upload(a, [
      [
        "08 Apr '26",
        "Self transfer",
        "existing-001",
        "CREDIT",
        "",
        "25",
        "1000",
      ],
    ]);
    await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Imported: 0 · Skipped: 1 · Reversals: 0 · Reconciled transfers: 1",
    );
    expect(await counts()).toBe(6);
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "Transfer" WHERE "userId"=$1',
          [user],
        )
      ).rows[0].n,
    ).toBe(2);
    // A full import above the old 500-row ceiling, with a different month/header/opening.
    const largeAccount = randomUUID();
    await db.query(
      'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,\'Large Slice test\',\'BANK\',0)',
      [largeAccount, user],
    );
    const many = Array.from({ length: 573 }, (_, i) => [
      "01 Jun '26",
      "Fictional merchant " + i,
      "L-" + i,
      "UPI",
      "1.01",
      "",
      ((900000 - (i + 1) * 101) / 100).toFixed(2),
    ]);
    await a.goto("/dashboard/import");
    await a
      .getByLabel("Destination account (for automatic Slice analysis)")
      .selectOption(largeAccount);
    await a
      .getByLabel("Statement file")
      .setInputFiles(await workbook(many, 17));
    await a.getByRole("button", { name: "Upload file", exact: true }).click();
    await expect(
      a.getByRole("heading", { name: "Import summary", exact: true }),
    ).toBeVisible();
    await a.getByRole("checkbox", { name: /Use .*opening balance/ }).check();
    await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Imported: 573 · Skipped: 0",
    );
    await expect(a.getByLabel("Slice import result")).toContainText(
      "₹8,421.27",
    );
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "SliceEntry" WHERE "accountId"=$1',
          [largeAccount],
        )
      ).rows[0].n,
    ).toBe(573);
    await a.goto("/dashboard/accounts");
    await expect(
      a.getByText(
        "Latest imported statement closed at ₹8,421.27 on 2026-06-01.",
      ),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
