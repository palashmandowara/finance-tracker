import { test, expect, type Page, type Request } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";
import { indiaToday } from "../../src/lib/months";
const tag = randomBytes(8).toString("hex"),
  password = randomBytes(24).toString("hex"),
  emails = [`m4-${tag}-a@example.test`, `m4-${tag}-b@example.test`];
const db = new Pool({
  connectionString: parse(readFileSync(".env", "utf8")).DATABASE_URL,
});
const bank = randomUUID(),
  card = randomUUID(),
  cat = randomUUID(),
  rentTx = randomUUID();
let uid = "";
const today = indiaToday();
async function register(p: Page, email: string) {
  await p.goto("/register");
  await p.getByLabel("Your name").fill("Calendar demo");
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
async function financial() {
  return (
    await db.query(
      'SELECT count(*)::int AS n,coalesce(sum(amount),0)::text AS amount FROM "Transaction" WHERE "userId"=$1',
      [uid],
    )
  ).rows[0];
}
async function replay(p: Page, r: Request) {
  return p.request.post(new URL(r.url()).pathname, {
    headers: {
      "next-action": r.headers()["next-action"],
      "content-type": r.headers()["content-type"],
      origin: "http://localhost:3000",
    },
    data: r.postDataBuffer()!,
  });
}
async function bill(
  p: Page,
  title: string,
  amount: string,
  kind: string,
  date: string,
  account = bank,
  recurrence = "ONCE",
) {
  await p.goto("/dashboard/bills");
  const f = p.getByRole("form", { name: "Create bill", exact: true });
  await f.getByLabel("Title", { exact: true }).fill(title);
  await f.getByLabel("Amount due (INR)").fill(amount);
  await f.getByLabel("Bill type").selectOption(kind);
  await f.getByLabel("First due date").fill(date);
  await f.getByLabel("Recurrence").selectOption(recurrence);
  await f.getByLabel("Account (optional)").selectOption(account);
  await f.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(f.getByRole("status")).toBeVisible();
  const o = (
    await db.query(
      'SELECT o.id FROM "BillOccurrence" o WHERE o."userId"=$1 AND o.title=$2 ORDER BY o."dueDate" LIMIT 1',
      [uid, title],
    )
  ).rows[0];
  return o.id as string;
}
async function openBill(p: Page, id: string) {
  await p.goto("/dashboard/bills/" + id);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
}
test.afterAll(async () => {
  const users = (
    await db.query('SELECT id FROM "User" WHERE email=ANY($1::text[])', [
      emails,
    ])
  ).rows.map((r) => r.id);
  for (const table of [
    "BillPayment",
    "BillOccurrence",
    "Bill",
    "SubscriptionDismissal",
    "Subscription",
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
test("milestone 4 desktop: schedules, suggestions, calendar, full payments and isolation", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const ca = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    cb = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  try {
    await register(a, emails[0]);
    uid = (await db.query('SELECT id FROM "User" WHERE email=$1', [emails[0]]))
      .rows[0].id;
    for (const [id, name, type, opening] of [
      [bank, "Demo bank", "BANK", 500000],
      [card, "Demo card", "CREDIT_CARD", -100000],
    ])
      await db.query(
        'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,$3,$4,$5)',
        [id, uid, name, type, opening],
      );
    await db.query(
      "INSERT INTO \"Category\" (id,\"userId\",name,type) VALUES ($1,$2,'Bills','EXPENSE')",
      [cat, uid],
    );
    for (const merchant of ["Stream Club", "Fitness Club"])
      for (const date of ["2026-08-01", "2026-09-01", "2026-10-01"])
        await db.query(
          'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,date,description,"updatedAt") VALUES ($1,$2,$3,$4,\'EXPENSE\',19900,$5,$6,NOW())',
          [randomUUID(), uid, bank, cat, date, merchant],
        );
    await db.query(
      'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,date,description,"updatedAt") VALUES ($1,$2,$3,$4,\'EXPENSE\',50000,\'2026-11-01\',\'Rent payment\',NOW())',
      [rentTx, uid, bank, cat],
    );
    const original = await financial();
    let subscriptionId = "";
    await test.step("suggestions show evidence and need confirmation; pause/edit/delete and dismiss work", async () => {
      await a.goto("/dashboard/subscriptions");
      const suggestion = a.getByRole("article", {
        name: "Stream Club suggestion",
      });
      await expect(suggestion).toContainText("2026-08-01");
      const request = a.waitForRequest(
        (r) => r.method() === "POST" && !!r.headers()["next-action"],
      );
      await suggestion
        .getByRole("button", { name: "Confirm subscription" })
        .click();
      const req = await request;
      await expect(suggestion).toHaveCount(0);
      await replay(a, req);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM "Subscription" WHERE "userId"=$1',
            [uid],
          )
        ).rows[0].n,
      ).toBe(1);
      await a
        .getByRole("article", { name: "Fitness Club suggestion" })
        .getByRole("button", { name: "Dismiss suggestion" })
        .click();
      await expect(
        a.getByRole("article", { name: "Fitness Club suggestion" }),
      ).toHaveCount(0);
      await a.reload();
      await expect(a.getByRole("article", { name: /suggestion$/ })).toHaveCount(
        0,
      );
      subscriptionId = (
        await db.query('SELECT id FROM "Subscription" WHERE "userId"=$1', [uid])
      ).rows[0].id;
      await a.getByRole("link", { name: "Stream Club", exact: true }).click();
      await a.getByRole("button", { name: "Pause subscription" }).click();
      await expect(
        a.getByRole("button", { name: "Resume subscription" }),
      ).toBeVisible();
      await a.getByRole("button", { name: "Resume subscription" }).click();
      const f = a.getByRole("form", { name: "Save subscription" });
      await f.getByLabel("Next renewal date").fill("2027-01-31");
      await f.getByRole("button", { name: "Save subscription" }).click();
      await expect(f.getByRole("status")).toBeVisible();
      await a.getByRole("button", { name: "Track as bill" }).click();
      await expect(
        a.getByRole("link", { name: "View linked bill schedule" }),
      ).toBeVisible();
      expect(await financial()).toEqual(original);
      await a.goto("/dashboard/subscriptions");
      const create = a.getByRole("form", { name: "Create subscription" });
      await create.getByLabel("Name", { exact: true }).fill("Yearly backup");
      await create.getByLabel("Amount (INR)").fill("1200");
      await create.getByLabel("Frequency").selectOption("YEARLY");
      await create.getByLabel("Next renewal date").fill("2024-02-29");
      await create.getByRole("button", { name: "Create subscription" }).click();
      await expect(create.getByRole("status")).toBeVisible();
      await expect(a.getByText("Estimated annualised cost")).toBeVisible();
      await a.goto("/dashboard/calendar?month=2027-02");
      await expect(a.getByRole("link", { name: /Stream Club/ })).toHaveCount(1);
      await expect(a.getByRole("link", { name: /Yearly backup/ })).toHaveCount(
        1,
      );
      const dates = (
        await db.query(
          'SELECT "scheduledDate"::text AS date FROM "BillOccurrence" o JOIN "Bill" b ON b.id=o."billId" WHERE b."subscriptionId"=$1 ORDER BY o."scheduledDate" LIMIT 3',
          [subscriptionId],
        )
      ).rows.map((r) => r.date);
      expect(dates).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
      await a.getByRole("link", { name: /Yearly backup/ }).click();
      a.once("dialog", (d) => d.accept());
      await a.getByRole("button", { name: "Delete subscription" }).click();
      await expect(a).toHaveURL(/\/dashboard\/subscriptions$/);
      await expect(
        a.getByRole("link", { name: "Yearly backup", exact: true }),
      ).toHaveCount(0);
    });
    let rent = "";
    let linkRequest: Request;
    await test.step("link existing expense without changing money; calendar paid/overdue state and replay safety", async () => {
      rent = await bill(
        a,
        "Rent bill",
        "500",
        "RENT",
        "2026-11-01",
        bank,
        "MONTHLY",
      );
      expect(await financial()).toEqual(original);
      await a.goto("/dashboard/calendar?month=2026-11");
      await expect(
        a.getByRole("link", { name: /Rent bill/ }).first(),
      ).toContainText("Overdue");
      await a
        .getByRole("link", { name: /Rent bill/ })
        .first()
        .click();
      const f = a.getByRole("form", { name: "Link payment" });
      await f.getByLabel("Matching payment").selectOption(rentTx);
      const pending = a.waitForRequest(
        (r) => r.method() === "POST" && !!r.headers()["next-action"],
      );
      await f.getByRole("button", { name: "Link payment" }).click();
      linkRequest = await pending;
      await expect(a.locator("main header")).toContainText("Paid");
      await replay(a, linkRequest);
      expect(await financial()).toEqual(original);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM "BillPayment" WHERE "occurrenceId"=$1 AND valid',
            [rent],
          )
        ).rows[0].n,
      ).toBe(1);
      await a.goto("/dashboard/calendar?month=2026-11");
      await expect(
        a.getByRole("link", { name: /Rent bill/ }).first(),
      ).toContainText("Paid");
      await a.getByRole("link", { name: "Next month", exact: true }).click();
      await expect(a).toHaveURL(/month=2026-12/);
      await a
        .getByRole("link", { name: "Previous month", exact: true })
        .click();
      await a.getByRole("link", { name: "Today", exact: true }).click();
      await expect(a).toHaveURL(new RegExp("month=" + today.slice(0, 7)));
    });
    await test.step("edits and deletion invalidate payment links; occurrence edits keep history and do not regenerate duplicates", async () => {
      await a.goto("/dashboard/transactions");
      await a
        .getByRole("button", { name: "Edit Rent payment", exact: true })
        .click();
      const dialog = a.getByRole("dialog");
      await dialog.getByLabel("Amount (₹)", { exact: true }).fill("600");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await expect(dialog).not.toBeVisible();
      await openBill(a, rent);
      await expect(a.locator("main header")).toContainText("Overdue");
      await expect(
        a.getByText("Linked expense changed; payment needs review"),
      ).toBeVisible();
      await a.getByText("Edit this unpaid occurrence", { exact: true }).click();
      const edit = a.getByRole("form", { name: "Save occurrence" });
      await edit.getByLabel("Amount due (INR)").fill("600");
      await edit.getByLabel("Due date", { exact: true }).fill("2026-11-03");
      await edit.getByRole("button", { name: "Save occurrence" }).click();
      await expect(edit.getByRole("status")).toBeVisible();
      await a.goto("/dashboard/bills");
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM "BillOccurrence" WHERE "userId"=$1 AND "billId"=(SELECT "billId" FROM "BillOccurrence" WHERE id=$2) AND "scheduledDate"=\'2026-11-01\'',
            [uid, rent],
          )
        ).rows[0].n,
      ).toBe(1);
      await openBill(a, rent);
      await a
        .getByRole("form", { name: "Link payment" })
        .getByLabel("Matching payment")
        .selectOption(rentTx);
      await a
        .getByRole("button", { name: "Link payment", exact: true })
        .click();
      await expect(a.locator("main header")).toContainText("Paid");
      await a.goto("/dashboard/transactions");
      a.once("dialog", (d) => d.accept());
      await a
        .getByRole("button", { name: "Delete Rent payment", exact: true })
        .click();
      await expect(
        a.getByRole("button", { name: "Delete Rent payment", exact: true }),
      ).toHaveCount(0);
      await openBill(a, rent);
      await expect(
        a.getByText("Linked expense deleted; payment needs review"),
      ).toBeVisible();
      const f = a.getByRole("form", { name: "Record full payment" });
      await f.getByLabel("Paying account").selectOption(bank);
      await f
        .getByRole("combobox", { name: "Expense category", exact: true })
        .selectOption(cat);
      const before = await financial();
      a.once("dialog", (d) => d.accept());
      const pending = a.waitForRequest(
        (r) => r.method() === "POST" && !!r.headers()["next-action"],
      );
      await f.getByRole("button", { name: "Record full payment" }).click();
      const req = await pending;
      await expect(a.locator("main header")).toContainText("Paid");
      await replay(a, req);
      expect((await financial()).n).toBe(before.n + 1);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM "BillPayment" WHERE "occurrenceId"=$1',
            [rent],
          )
        ).rows[0].n,
      ).toBe(3);
    });
    await test.step("editing the bill schedule preserves paid history and updates future unpaid amounts", async () => {
      const before = await financial();
      await a.goto("/dashboard/bills");
      const details = a.locator("details").filter({
        has: a.locator("summary", { hasText: "Rent bill · monthly" }),
      });
      await details.locator("summary").click();
      const form = details.getByRole("form", { name: "Save bill schedule" });
      await form.getByLabel("Amount due (INR)").fill("650");
      await form.getByRole("button", { name: "Save bill schedule" }).click();
      await expect(form.getByRole("status")).toBeVisible();
      const records = (
        await db.query(
          'SELECT amount,"scheduledDate"::text AS date FROM "BillOccurrence" WHERE "billId"=(SELECT "billId" FROM "BillOccurrence" WHERE id=$1) ORDER BY "scheduledDate" LIMIT 2',
          [rent],
        )
      ).rows;
      expect(records).toEqual([
        { amount: 60000, date: "2026-11-01" },
        { amount: 65000, date: "2026-12-01" },
      ]);
      expect(await financial()).toEqual(before);
    });
    let creditBill = "";
    let paymentRequest: Request;
    await test.step("credit statement amount is manual; full repayment records only a transfer and is repeat-safe", async () => {
      creditBill = await bill(
        a,
        "Card statement",
        "700",
        "CREDIT_CARD",
        "2026-11-05",
        card,
      );
      await openBill(a, creditBill);
      await expect(a.locator("main header")).toContainText("₹700.00");
      const before = await financial();
      const f = a.getByRole("form", { name: "Record full payment" });
      await f.getByLabel("Paying account").selectOption(bank);
      a.once("dialog", (d) => d.accept());
      const pending = a.waitForRequest(
        (r) => r.method() === "POST" && !!r.headers()["next-action"],
      );
      await f.getByRole("button", { name: "Record full payment" }).click();
      paymentRequest = await pending;
      await expect(a.locator("main header")).toContainText("Paid");
      await replay(a, paymentRequest);
      expect(await financial()).toEqual(before);
      const transfers = (
        await db.query('SELECT * FROM "Transfer" WHERE "userId"=$1', [uid])
      ).rows;
      expect(transfers.length).toBe(1);
      expect(transfers[0].amount).toBe(70000);
      expect(transfers[0].fromId).toBe(bank);
      expect(transfers[0].toId).toBe(card);
      await a.goto("/dashboard/accounts");
      await expect(
        a
          .locator("article")
          .filter({ has: a.getByRole("heading", { name: "Demo card" }) }),
      ).toContainText("-₹300.00");
      await a.goto("/dashboard/transfers");
      a.once("dialog", (d) => d.accept());
      await a.getByRole("button", { name: "Delete transfer" }).click();
      await expect(
        a.getByRole("button", { name: "Delete transfer" }),
      ).toHaveCount(0);
      await openBill(a, creditBill);
      await expect(
        a.getByText("Linked transfer deleted; payment needs review"),
      ).toBeVisible();
      await expect(a.locator("main header")).toContainText("Upcoming");
    });
    await test.step("foreign reads, mutation replay and mismatched payment links are rejected", async () => {
      await register(b, emails[1]);
      await b.goto("/dashboard/subscriptions/" + subscriptionId);
      await expect(
        b.getByRole("heading", { name: /not found|page isn/i }),
      ).toBeVisible();
      await replay(b, paymentRequest!);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM "Transfer" WHERE "userId"=$1',
            [uid],
          )
        ).rows[0].n,
      ).toBe(0);
      const buid = (
        await db.query('SELECT id FROM "User" WHERE email=$1', [emails[1]])
      ).rows[0].id;
      const bbank = randomUUID(),
        bcat = randomUUID(),
        foreign = randomUUID();
      await db.query(
        'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,\'Private bank\',\'BANK\',0)',
        [bbank, buid],
      );
      await db.query(
        "INSERT INTO \"Category\" (id,\"userId\",name,type) VALUES ($1,$2,'Private category','EXPENSE')",
        [bcat, buid],
      );
      await db.query(
        'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,date,description,"updatedAt") VALUES ($1,$2,$3,$4,\'EXPENSE\',99900,$5,\'Private expense\',NOW())',
        [foreign, buid, bbank, bcat, today],
      );
      const target = await bill(a, "Needs full payment", "999", "OTHER", today);
      await openBill(a, target);
      const f = a.getByRole("form", { name: "Link payment" });
      await f
        .getByLabel("Matching payment")
        .evaluate(
          (el, id) =>
            (el as HTMLSelectElement).add(new Option("Foreign payment", id)),
          foreign,
        );
      await f.getByLabel("Matching payment").selectOption(foreign);
      await f.getByRole("button", { name: "Link payment" }).click();
      await expect(f.getByRole("alert")).toContainText("full matching expense");
      await a.goto("/dashboard/subscriptions");
      const create = a.getByRole("form", { name: "Create subscription" });
      await create
        .getByLabel("Name", { exact: true })
        .fill("Rejected foreign account");
      await create.getByLabel("Amount (INR)").fill("50");
      await create.getByLabel("Next renewal date").fill(today);
      await create
        .getByLabel("Account (optional)")
        .evaluate(
          (el, id) =>
            (el as HTMLSelectElement).add(new Option("Foreign account", id)),
          bbank,
        );
      await create.getByLabel("Account (optional)").selectOption(bbank);
      await create.getByRole("button", { name: "Create subscription" }).click();
      await expect(create.getByRole("alert")).toHaveText(
        "Please choose your own account.",
      );
    });
    await a.goto("/dashboard/calendar?month=2026-11");
    mkdirSync("design/qa", { recursive: true });
    await a.screenshot({
      path: "design/qa/m4-calendar-desktop.png",
      fullPage: true,
    });
    await a.goto("/dashboard");
    await expect(
      a.getByRole("region", { name: "Financial reminders" }),
    ).toContainText("Needs full payment");
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
