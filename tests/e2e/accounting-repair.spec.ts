import { test, expect, type Page } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";
import ExcelJS from "exceljs";
const db = new Pool({
  connectionString: parse(readFileSync(".env", "utf8")).DATABASE_URL,
});
const tag = randomBytes(8).toString("hex");
const emails = [`repair-${tag}-a@example.test`, `repair-${tag}-b@example.test`],
  password = randomBytes(24).toString("hex");
let user = "";
const bank = randomUUID(),
  card = randomUUID();
const rows = [
  ["01 Apr '26", "Interest Cr. for March", "001", "CREDIT", "", "10", "5010"],
  [
    "01 Apr '26",
    "UPI-Debit-123456789012-IRCTC E Ticketing-HDFC-irctc.payu@hdfcbank-ticket",
    "002",
    "UPI",
    "1000",
    "",
    "4010",
  ],
  [
    "01 Apr '26",
    "UPI reversal reference number 123456789012",
    "003",
    "UPI REVERSAL",
    "",
    "1000",
    "5010",
  ],
  [
    "02 Apr '26",
    "UPI-Debit-123456789013-NANDINI-YESB0YBLUPI-q12345@ybl",
    "004",
    "UPI",
    "50",
    "",
    "4960",
  ],
  [
    "02 Apr '26",
    "UPI Credit-Fictional Person-person@okaxis",
    "005",
    "CREDIT",
    "",
    "200",
    "5160",
  ],
  [
    "03 Apr '26",
    "Self transfer card repayment",
    "006",
    "DEBIT",
    "500",
    "",
    "4660",
  ],
  [
    "03 Apr '26",
    "UPI-Debit-123456789014-SWIGGY-UTIB-swiggyupi@axb-paid",
    "007",
    "UPI",
    "100",
    "",
    "4560",
  ],
];
async function upload(p: Page, account = bank, data = rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Statement");
  sheet.addRow(["Anonymous fictional metadata"]);
  sheet.addRow([
    "DATE",
    "DETAILS",
    "REF NO.",
    "TRANSACTION TYPE",
    "DEBIT",
    "CREDIT",
    "BALANCE",
  ]);
  data.forEach((r) => sheet.addRow(r));
  await p.goto("/dashboard/import");
  await p
    .getByLabel("Destination account (for automatic Slice analysis)")
    .selectOption(account);
  await p.getByLabel("Statement file").setInputFiles({
    name: "anonymised.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  });
  await p.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Import summary", exact: true }),
  ).toBeVisible();
}
async function confirm(p: Page) {
  const req = p.waitForRequest(
    (r) => r.method() === "POST" && !!r.headers()["next-action"],
  );
  await p
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const r = await req;
  await expect(p.getByLabel("Slice import result")).toBeVisible();
  return r;
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
    "MerchantClassification",
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
test("accounting repair: missing credits, classification, reconciliation, corrections and ownership", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const ca = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    for (const [p, email] of [
      [a, emails[0]],
      [b, emails[1]],
    ] as const) {
      const response = await p.request.post("/api/auth/sign-up/email", {
        data: { email, password, name: "Fictional repair test" },
      });
      expect(response.ok()).toBeTruthy();
    }
    user = (await db.query('SELECT id FROM "User" WHERE email=$1', [emails[0]]))
      .rows[0].id;
    await db.query(
      "INSERT INTO \"FinancialAccount\" (id,\"userId\",name,type,\"openingBalance\") VALUES ($1,$2,'Repair bank','BANK',0),($3,$2,'Repair card','CREDIT_CARD',-100000)",
      [bank, user, card],
    );
    await upload(a);
    await a.getByRole("checkbox", { name: /Use .*opening balance/ }).check();
    await a.getByLabel("Row 8 action").selectOption("TRANSFER");
    await a.getByLabel("Row 8 other account").selectOption(card);
    const first = await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "₹4,560.00",
    );
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Reversals: 1",
    );
    const saved = (
      await db.query(
        'SELECT * FROM "Transaction" WHERE "userId"=$1 ORDER BY "sourceOrder"',
        [user],
      )
    ).rows;
    expect(saved).toHaveLength(6);
    expect(saved.find((r) => r.reference === "005").accountingEffect).toBe(
      "NEUTRAL",
    );
    expect(
      saved.find((r) => r.reference === "004").classification.merchant,
    ).toBe("Nandini");
    expect(
      saved.find((r) => r.reference === "004").classification.subcategory,
    ).toBe("Dairy");
    expect(saved.find((r) => r.reference === "003").reversalOfId).toBe(
      saved.find((r) => r.reference === "002").id,
    );
    await a.goto("/dashboard?month=2026-04");
    const totals = a.getByRole("region", { name: "Financial totals" });
    await expect(totals).toContainText("₹4,060.00");
    await expect(totals).toContainText("₹150.00");
    await expect(totals).toContainText("₹10.00");
    await upload(a);
    await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "Imported: 0 · Skipped: 7",
    );
    // Missing-credit recovery in an existing account: preserve the original debit and opening balance.
    const existingAccount = randomUUID(),
      expense = randomUUID(),
      category = (
        await db.query(
          'SELECT id FROM "Category" WHERE "userId"=$1 AND type=\'EXPENSE\' LIMIT 1',
          [user],
        )
      ).rows[0].id;
    await db.query(
      'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,\'Existing repair account\',\'BANK\',100000)',
      [existingAccount, user],
    );
    await db.query(
      'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,description,date,reference,"updatedAt") VALUES ($1,$2,$3,$4,\'EXPENSE\',150000,\'Existing purchase\',\'2026-04-01\',\'OLD1\',NOW())',
      [expense, user, existingAccount, category],
    );
    const recovery = [
      ["01 Apr '26", "Existing purchase", "OLD1", "DEBIT", "1500", "", "-500"],
      [
        "02 Apr '26",
        "UPI reversal reference number 999999999999",
        "MISSING",
        "CREDIT",
        "",
        "2000",
        "1500",
      ],
    ];
    await upload(a, existingAccount, recovery);
    await a.getByLabel("Row 4 action").selectOption("DEFER");
    expect(
      await a.getByRole("checkbox", { name: /Use .*opening balance/ }).count(),
    ).toBe(0);
    await confirm(a);
    await expect(a.getByLabel("Slice import result")).toContainText(
      "₹1,500.00",
    );
    expect(
      (
        await db.query(
          'SELECT "openingBalance" FROM "FinancialAccount" WHERE id=$1',
          [existingAccount],
        )
      ).rows[0].openingBalance,
    ).toBe(100000);
    expect(
      (
        await db.query('SELECT amount FROM "Transaction" WHERE id=$1', [
          expense,
        ])
      ).rows[0].amount,
    ).toBe(150000);
    // A missing period / wrong existing opening must block atomically, not mask the discrepancy.
    await upload(a, existingAccount, [
      ["03 Apr '26", "Nandini", "GAP", "DEBIT", "50", "", "5000"],
    ]);
    await expect(
      a.getByRole("button", { name: "Import statement", exact: true }),
    ).toBeDisabled();
    const batch = (
      await db.query(
        'SELECT id FROM "ImportBatch" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
        [user],
      )
    ).rows[0].id;
    const forced = await a.request.post("/dashboard/import", {
      headers: {
        "next-action": first.headers()["next-action"],
        "content-type": first.headers()["content-type"],
        origin: "http://localhost:3000",
      },
      data: JSON.stringify([batch, [], false]),
    });
    expect(await forced.text()).toContain("Reconciliation failed");
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "Transaction" WHERE reference=\'GAP\' AND "userId"=$1',
          [user],
        )
      ).rows[0].n,
    ).toBe(0);
    const forcedSkip = await a.request.post("/dashboard/import", {
      headers: {
        "next-action": first.headers()["next-action"],
        "content-type": first.headers()["content-type"],
        origin: "http://localhost:3000",
      },
      data: JSON.stringify([batch, [{ order: 3, action: "SKIP" }], false]),
    });
    expect(await forcedSkip.text()).toContain("skipping a new bank movement");
    // Preview and explicitly apply older classifications; another user cannot apply this plan.
    await db.query(
      'INSERT INTO "SliceEntry" (id,"userId","accountId",key,"sourceOrder",balance,date,"transactionId") VALUES ($1,$2,$3,$4,3,-50000,\'2026-04-01\',$5)',
      [
        randomUUID(),
        user,
        existingAccount,
        createHash("sha256").update("isolated legacy provenance").digest("hex"),
        expense,
      ],
    );
    await a.goto("/dashboard/review");
    await expect(
      a.getByRole("heading", { name: "1 existing movements" }),
    ).toBeVisible();
    const planRequest = a.waitForRequest(
      (r) => r.method() === "POST" && !!r.headers()["next-action"],
    );
    await a
      .getByRole("button", { name: "Confirm reviewed classifications" })
      .click();
    const plan = await planRequest;
    await expect(
      a.getByRole("heading", { name: "0 existing movements" }),
    ).toBeVisible();
    expect(
      (
        await db.query(
          'SELECT "accountingEffect",amount FROM "Transaction" WHERE id=$1',
          [expense],
        )
      ).rows[0],
    ).toMatchObject({ accountingEffect: "NEUTRAL", amount: 150000 });
    const planDenied = await b.request.post("/dashboard/review", {
      headers: {
        "next-action": plan.headers()["next-action"],
        "content-type": plan.headers()["content-type"],
        origin: "http://localhost:3000",
      },
      data: plan.postData()!,
    });
    expect(await planDenied.text()).toContain("Records or rules changed");
    // A correction is explicit, scoped to the owner, and remembered for a merchant identity.
    await a.goto("/dashboard/transactions");
    const target = a.locator("tr").filter({ hasText: "NANDINI" }).first();
    await target.getByText("Review classification", { exact: true }).click();
    await target
      .getByLabel("Subcategory", { exact: true })
      .fill("Campus dairy");
    await target.getByRole("checkbox", { name: /Remember/ }).check();
    const request = a.waitForRequest(
      (r) => r.method() === "POST" && !!r.headers()["next-action"],
    );
    await target
      .getByRole("button", { name: "Confirm classification", exact: true })
      .click();
    const correction = await request;
    await expect(target.getByRole("status")).toContainText(
      "Classification saved",
    );
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "MerchantClassification" WHERE "userId"=$1',
          [user],
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
    const denial = await b.request.post("/dashboard/transactions", {
      headers: {
        "next-action": correction.headers()["next-action"],
        "content-type": correction.headers()["content-type"],
        origin: "http://localhost:3000",
      },
      data: correction.postData()!,
    });
    expect(await denial.text()).toContain("Transaction not found");
  } finally {
    await ca.close();
    await cb.close();
  }
});
