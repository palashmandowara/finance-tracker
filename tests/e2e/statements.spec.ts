import { test, expect, type Page, type Request } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { parse as envParse } from "dotenv";
import { parse as csvParse } from "csv-parse/sync";
import { Pool } from "pg";
const tag = randomBytes(8).toString("hex"),
  password = randomBytes(24).toString("hex"),
  emails = [`m3-${tag}-a@example.test`, `m3-${tag}-b@example.test`];
const db = new Pool({
  connectionString: envParse(readFileSync(".env", "utf8")).DATABASE_URL,
});
const ids = {
  bank: randomUUID(),
  card: randomUUID(),
  cash: randomUUID(),
  food: randomUUID(),
  income: randomUUID(),
  other: randomUUID(),
  foreign: randomUUID(),
};
let user = "";
async function register(p: Page, email: string) {
  await p.goto("/register");
  await p.getByLabel("Your name").fill("Statement demo");
  await p.getByLabel("Email address").fill(email);
  for (const label of ["Password", "Confirm password"])
    await p.getByLabel(label, { exact: true }).evaluate((e, v) => {
      (e as HTMLInputElement).value = v;
    }, password);
  await p.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(p).toHaveURL(/\/setup$/);
  await p.getByRole("link", { name: "Skip for now" }).click();
  await expect(p).toHaveURL(/\/dashboard$/);
}
async function upload(
  p: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
  account = ids.bank,
  mode = "split",
) {
  await p.goto("/dashboard/import");
  await p.getByLabel("Statement file").setInputFiles(file);
  await p.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Map your columns" }),
  ).toBeVisible();
  await p.getByLabel("Destination account").selectOption(account);
  for (const [key, value] of Object.entries({
    date: "0",
    description: "1",
    debit: mode === "split" ? "2" : "-1",
    credit: mode === "split" ? "3" : "-1",
    amount: mode === "signed" ? "2" : "-1",
    type: "-1",
    reference: mode === "split" ? "4" : "3",
  }))
    await p.locator(`select[name=${key}]`).selectOption(value);
  await p.getByLabel("Amount layout").selectOption(mode);
  await p.getByLabel("Date format").selectOption("DMY");
  await p.getByLabel("Positive signed amount means").selectOption("INCOME");
  await p.getByRole("button", { name: "Review import" }).click();
  await expect(
    p.getByRole("heading", { name: "Review every row" }),
  ).toBeVisible();
}
const row = (p: Page, n: number) =>
  p.getByRole("article", { name: `Import row ${n}`, exact: true });
async function confirm(p: Page) {
  const request = p.waitForRequest(
    (r) => r.method() === "POST" && Boolean(r.headers()["next-action"]),
  );
  await p.getByRole("button", { name: "Confirm import", exact: true }).click();
  const req = await request;
  await expect(p.getByRole("region", { name: "Import result" })).toBeVisible();
  return req;
}
async function replay(p: Page, req: Request) {
  return p.request.post("/dashboard/import", {
    headers: {
      "next-action": req.headers()["next-action"],
      "content-type": req.headers()["content-type"],
      origin: "http://localhost:3000",
    },
    data: req.postData()!,
  });
}
async function counts() {
  return (
    await db.query(
      'SELECT count(*)::int AS n,coalesce(sum(amount),0)::text AS sum FROM "Transaction" WHERE "userId"=$1',
      [user],
    )
  ).rows[0];
}
async function balance(account: string) {
  return Number(
    (
      await db.query(
        'SELECT a."openingBalance" + coalesce((SELECT sum(CASE WHEN type=\'INCOME\' THEN amount ELSE -amount END) FROM "Transaction" WHERE "accountId"=a.id),0) + coalesce((SELECT sum(amount) FROM "Transfer" WHERE "toId"=a.id),0)-coalesce((SELECT sum(amount) FROM "Transfer" WHERE "fromId"=a.id),0) AS balance FROM "FinancialAccount" a WHERE id=$1',
        [account],
      )
    ).rows[0].balance,
  );
}
test.afterAll(async () => {
  const users = (
    await db.query('SELECT id FROM "User" WHERE email=ANY($1::text[])', [
      emails,
    ])
  ).rows.map((r) => r.id);
  for (const table of [
    "MerchantRule",
    "ImportBatch",
    "Transfer",
    "Budget",
    "GoalContribution",
    "SavingsGoal",
    "Transaction",
    "Category",
    "FinancialAccount",
  ])
    await db.query(`DELETE FROM "${table}" WHERE "userId"=ANY($1::text[])`, [
      users,
    ]);
  await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [users]);
  await db.end();
});
test("milestone 3 desktop: statements, exports, rules, reconciliation, transfers and ownership", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const ca = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  try {
    await register(a, emails[0]);
    user = (await db.query('SELECT id FROM "User" WHERE email=$1', [emails[0]]))
      .rows[0].id;
    for (const [id, name, type, opening] of [
      [ids.bank, "Demo bank", "BANK", 500000],
      [ids.card, "Demo card", "CREDIT_CARD", -100000],
      [ids.cash, "Demo cash", "CASH", 0],
    ])
      await db.query(
        'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,$3,$4,$5)',
        [id, user, name, type, opening],
      );
    for (const [id, name, type] of [
      [ids.food, "Groceries", "EXPENSE"],
      [ids.income, "Salary", "INCOME"],
      [ids.other, "Other", "EXPENSE"],
    ])
      await db.query(
        'INSERT INTO "Category" (id,"userId",name,type) VALUES ($1,$2,$3,$4)',
        [id, user, name, type],
      );
    await test.step("CSV map, editable categories, intra-upload duplicate and explicit confirmation", async () => {
      await upload(a, "public/samples/statement.csv");
      await expect(
        row(a, 2).getByRole("combobox", { name: "Category", exact: true }),
      ).toHaveValue(ids.food);
      await expect(row(a, 4).getByLabel("Decision")).toHaveValue("SKIP");
      await expect(row(a, 5)).toContainText("excluded");
      expect((await counts()).n).toBe(0);
      await row(a, 2)
        .getByRole("combobox", { name: "Category", exact: true })
        .selectOption(ids.other);
      await row(a, 2).getByLabel("Remember category for this merchant").check();
      await row(a, 2).getByLabel("Merchant keyword").fill("campus");
      mkdirSync("design/qa", { recursive: true });
      await a.screenshot({ path: "design/qa/m3-review-desktop.png" });
      const req = await confirm(a);
      await expect(
        a.getByRole("region", { name: "Import result" }),
      ).toContainText("Imported: 2 · Skipped: 2 · Invalid: 0");
      expect((await counts()).n).toBe(2);
      await replay(a, req);
      expect((await counts()).n).toBe(2);
      expect(await balance(ids.bank)).toBe(650000);
      await register(b, emails[1]);
      await replay(b, req);
      expect((await counts()).n).toBe(2);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM "Transaction" t JOIN "User" u ON u.id=t."userId" WHERE u.email=$1',
            [emails[1]],
          )
        ).rows[0].n,
      ).toBe(0);
      await a
        .getByRole("link", { name: "Open dashboard", exact: true })
        .click();
      await expect(
        a.getByRole("region", { name: "Financial totals" }),
      ).toContainText("₹5,500.00");
    });
    await test.step("XLSX repeat import and learned rule suggestions", async () => {
      await upload(a, "public/samples/statement.xlsx");
      await expect(
        row(a, 2).getByRole("combobox", { name: "Category", exact: true }),
      ).toHaveValue(ids.other);
      await expect(row(a, 2).getByLabel("Decision")).toHaveValue("SKIP");
      await expect(row(a, 2)).toContainText("Demo bank");
      await confirm(a);
      await expect(
        a.getByRole("region", { name: "Import result" }),
      ).toContainText("Imported: 0 · Skipped: 4");
      expect((await counts()).n).toBe(2);
    });
    await test.step("invalid date and unknown category reported; signed amounts corrected in preview", async () => {
      await upload(
        a,
        {
          name: "signed.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "Date,Description,Amount,Reference\n31/02/2026,Invalid,-25,INVALID\n02/11/2026,Unknown merchant,-50,UNKNOWN\n02/11/2026,Campus cafe,-100,CAFE",
          ),
        },
        ids.bank,
        "signed",
      );
      await expect(
        row(a, 4).getByRole("combobox", { name: "Category", exact: true }),
      ).toHaveValue(ids.other);
      await row(a, 4).getByLabel("Amount (INR)").fill("75.50");
      await confirm(a);
      await expect(
        a.getByRole("region", { name: "Import result" }),
      ).toContainText("Imported: 1 · Skipped: 0 · Invalid: 2");
      expect(await balance(ids.bank)).toBe(642450);
    });
    await test.step("card purchase remains expense; repayment and transfers do not add expenses", async () => {
      await db.query(
        'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,date,description,"updatedAt") VALUES ($1,$2,$3,$4,\'EXPENSE\',50000,\'2026-11-02\',\'Card groceries\',NOW())',
        [randomUUID(), user, ids.card, ids.food],
      );
      const before = await counts();
      await a.goto("/dashboard/transfers");
      const f = a.getByRole("form", { name: "New transfer" });
      await f.getByLabel("From account").selectOption(ids.bank);
      await f.getByLabel("To account").selectOption(ids.card);
      await f.getByLabel("Amount (INR)").fill("1000");
      await f.getByLabel("Date", { exact: true }).fill("2026-11-02");
      await f.getByLabel("Description").fill("Card repayment");
      await f.getByLabel("Reference (optional)").fill("PAY-1");
      await f.getByRole("button", { name: "Save transfer" }).click();
      await expect(f.getByRole("status")).toBeVisible();
      expect(await counts()).toEqual(before);
      expect(await balance(ids.bank)).toBe(542450);
      expect(await balance(ids.card)).toBe(-50000);
      await a.goto("/dashboard/accounts");
      await expect(
        a
          .locator("article")
          .filter({ has: a.getByRole("heading", { name: "Demo card" }) }),
      ).toContainText("-₹500.00");
      await upload(
        a,
        {
          name: "card.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "Date,Description,Debit,Credit,Reference\n02/11/2026,Payment received,,1000,PAY-1",
          ),
        },
        ids.card,
      );
      await expect(row(a, 2).getByLabel("Decision")).toHaveValue("SKIP");
      await expect(row(a, 2)).toContainText("Demo bank → Demo card");
      await row(a, 2).getByLabel("Decision").selectOption("IMPORT");
      await confirm(a);
      await expect(
        a.getByRole("region", { name: "Import result" }),
      ).toContainText("Imported: 0 · Skipped: 1 · Invalid: 0 · Reconciled: 1");
      expect(await balance(ids.card)).toBe(-50000);
      await upload(a, {
        name: "move.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Date,Description,Debit,Credit,Reference\n02/11/2026,Self transfer,300,,MOVE-1",
        ),
      });
      await expect(row(a, 2).getByLabel("Record as")).toHaveValue("TRANSFER");
      await row(a, 2).getByLabel("Other account").selectOption(ids.cash);
      await confirm(a);
      expect(await balance(ids.cash)).toBe(30000);
      expect(await counts()).toEqual(before);
    });
    await test.step("export includes all matching rows across pagination and escapes formulas", async () => {
      for (let i = 0; i < 23; i++)
        await db.query(
          'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,date,description,"updatedAt") VALUES ($1,$2,$3,$4,\'EXPENSE\',100,\'2026-11-02\',$5,NOW())',
          [
            randomUUID(),
            user,
            ids.bank,
            ids.other,
            i === 0 ? '=HYPERLINK("evil")' : "Export demo " + i,
          ],
        );
      await a.goto(
        `/dashboard/transactions?account=${ids.bank}&category=${ids.other}&type=EXPENSE&from=2026-11-02&to=2026-11-02`,
      );
      await expect(a.locator("tbody tr")).toHaveCount(20);
      const link = a.getByRole("link", { name: "Export CSV" });
      const response = await a.request.get((await link.getAttribute("href"))!);
      expect(response.ok()).toBe(true);
      const rows = csvParse(await response.text(), { bom: true });
      expect(rows.length).toBe(26);
      expect(rows[0]).toEqual([
        "Date",
        "Account",
        "Type",
        "Category",
        "Description",
        "Amount (INR)",
      ]);
      expect(rows.some((r: string[]) => r[4] === '\'=HYPERLINK("evil")')).toBe(
        true,
      );
      const foreign = await b.request.get(
        `/dashboard/transactions/export?account=${ids.bank}`,
      );
      expect(csvParse(await foreign.text(), { bom: true }).length).toBe(1);
    });
    await test.step("foreign transfer account and import category are rejected by server", async () => {
      const otherUser = (
        await db.query('SELECT id FROM "User" WHERE email=$1', [emails[1]])
      ).rows[0].id;
      await db.query(
        'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,\'Other private account\',\'BANK\',0)',
        [ids.foreign, otherUser],
      );
      await a.goto("/dashboard/transfers");
      const f = a.getByRole("form", { name: "New transfer" });
      await f.getByLabel("From account").selectOption(ids.bank);
      await f
        .getByLabel("To account")
        .evaluate(
          (e, id) => (e as HTMLSelectElement).add(new Option("Foreign", id)),
          ids.foreign,
        );
      await f.getByLabel("To account").selectOption(ids.foreign);
      await f.getByLabel("Amount (INR)").fill("1");
      await f.getByLabel("Date", { exact: true }).fill("2026-11-02");
      await f.getByLabel("Description").fill("Must reject");
      await f.getByRole("button", { name: "Save transfer" }).click();
      await expect(f.getByRole("alert")).toHaveText(
        "Choose two accounts you own.",
      );
      const category = randomUUID();
      await db.query(
        "INSERT INTO \"Category\" (id,\"userId\",name,type) VALUES ($1,$2,'Private','EXPENSE')",
        [category, otherUser],
      );
      await upload(a, {
        name: "foreign.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Date,Description,Debit,Credit,Reference\n02/11/2026,Foreign category,1,,NO",
        ),
      });
      await row(a, 2)
        .getByRole("combobox", { name: "Category", exact: true })
        .evaluate(
          (e, id) => (e as HTMLSelectElement).add(new Option("Foreign", id)),
          category,
        );
      await row(a, 2)
        .getByRole("combobox", { name: "Category", exact: true })
        .selectOption(category);
      await confirm(a);
      await expect(
        a.getByRole("region", { name: "Import result" }),
      ).toContainText("Imported: 0 · Skipped: 0 · Invalid: 1");
      expect(await balance(ids.foreign)).toBe(0);
    });
    await test.step("explicit Keep both, transfer deletion and isolated rule suggestions", async () => {
      const before = await counts();
      await upload(a, "public/samples/statement.csv");
      await row(a, 2).getByLabel("Decision").selectOption("KEEP");
      await confirm(a);
      await expect(
        a.getByRole("region", { name: "Import result" }),
      ).toContainText("Imported: 1");
      expect((await counts()).n).toBe(before.n + 1);
      await upload(b, "public/samples/statement.csv", ids.foreign);
      await expect(
        row(b, 2).getByRole("combobox", { name: "Category", exact: true }),
      ).toHaveValue("");
      await b.getByRole("button", { name: "Change mapping" }).click();
      await b
        .getByLabel("Destination account")
        .evaluate(
          (el, id) =>
            (el as HTMLSelectElement).add(new Option("Foreign bank", id)),
          ids.bank,
        );
      await b.getByLabel("Destination account").selectOption(ids.bank);
      for (const [key, value] of Object.entries({
        date: "0",
        description: "1",
        debit: "2",
        credit: "3",
        amount: "-1",
        type: "-1",
        reference: "4",
      }))
        await b.locator(`select[name=${key}]`).selectOption(value);
      await b.getByLabel("Amount layout").selectOption("split");
      await b.getByLabel("Date format").selectOption("DMY");
      await b.getByLabel("Positive signed amount means").selectOption("INCOME");
      await b.getByRole("button", { name: "Review import" }).click();
      await expect(b.locator("p[role=alert]")).toHaveText(
        "Choose your own destination account.",
      );
      await a.goto("/dashboard/transfers");
      const movement = a.locator("article").filter({
        has: a.getByRole("heading", { name: "Self transfer", exact: true }),
      });
      const bankBefore = await balance(ids.bank),
        cashBefore = await balance(ids.cash);
      a.once("dialog", (d) => d.accept());
      await movement.getByRole("button", { name: "Delete transfer" }).click();
      await expect(movement).toHaveCount(0);
      expect(await balance(ids.bank)).toBe(bankBefore + 30000);
      expect(await balance(ids.cash)).toBe(cashBefore - 30000);
      const expense = Number(
        (
          await db.query(
            'SELECT sum(amount) AS sum FROM "Transaction" WHERE "userId"=$1 AND type=\'EXPENSE\'',
            [user],
          )
        ).rows[0].sum,
      );
      await db.query(
        'INSERT INTO "Budget" (id,"userId",month,scope,amount,"updatedAt") VALUES ($1,$2,\'2026-11\',\'overall\',100000,NOW())',
        [randomUUID(), user],
      );
      await a.goto("/dashboard/budgets?month=2026-11");
      await expect(
        a.getByRole("article", { name: "Overall expenses budget" }),
      ).toContainText(
        new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(expense / 100) + " spent",
      );
      await a.goto("/dashboard");
      await expect(
        a.getByRole("region", { name: "Financial totals" }),
      ).toContainText(
        new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(expense / 100),
      );
    });
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
