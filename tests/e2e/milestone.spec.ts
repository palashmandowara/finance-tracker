import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";

// Only records belonging to these randomly named test users are removed.
// Never record browser traces or print credentials in these integration tests.
const runId = randomBytes(8).toString("hex");
const emails = [
  `ft-e2e-${runId}-a@example.test`,
  `ft-e2e-${runId}-b@example.test`,
];
const password = randomBytes(24).toString("hex");
const env = parse(readFileSync(".env", "utf8"));
const db = new Pool({ connectionString: env.DATABASE_URL, max: 2 });

async function enterPassword(page: Page) {
  await page
    .getByLabel("Password", { exact: true })
    .evaluate((element, value) => {
      (element as HTMLInputElement).value = value;
    }, password);
}
async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Milestone test");
  await page.getByLabel("Email address").fill(email);
  await enterPassword(page);
  await page
    .getByLabel("Confirm password", { exact: true })
    .evaluate((element, value) => {
      (element as HTMLInputElement).value = value;
    }, password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function account(page: Page, name: string, opening = "0") {
  await page.goto("/dashboard/accounts");
  await page.getByLabel("Account name").fill(name);
  await page.getByLabel("Opening balance (₹)", { exact: true }).fill(opening);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function category(page: Page, name: string, type: "INCOME" | "EXPENSE") {
  await page.goto("/dashboard/categories");
  await page.getByLabel("Category name").fill(name);
  await page.locator('select[name="type"]').selectOption(type);
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}
async function fillTransaction(
  page: Page,
  description: string,
  amount: string,
  type: "INCOME" | "EXPENSE",
  accountName: string,
  categoryName: string,
) {
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New transaction" });
  await dialog.locator('select[name="type"]').selectOption(type);
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByLabel("Amount (₹)", { exact: true }).fill(amount);
  await dialog.getByLabel("Date", { exact: true }).fill("2026-11-02");
  await dialog
    .locator('select[name="accountId"]')
    .selectOption({ label: accountName });
  await dialog
    .locator('select[name="categoryId"]')
    .selectOption({ label: categoryName });
  return dialog;
}
async function addTransaction(
  page: Page,
  description: string,
  amount: string,
  type: "INCOME" | "EXPENSE",
  accountName: string,
  categoryName: string,
) {
  await page.goto("/dashboard/transactions");
  const dialog = await fillTransaction(
    page,
    description,
    amount,
    type,
    accountName,
    categoryName,
  );
  await dialog
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
}
async function injectForeignOption(select: Locator, id: string) {
  await select.evaluate((element, value) => {
    (element as HTMLSelectElement).add(
      new Option("Foreign record test", value),
    );
  }, id);
  await select.selectOption(id);
}

test.afterAll(async () => {
  // Transactions first because their account/category foreign keys use RESTRICT.
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const ids = (
      await client.query(
        'SELECT id FROM "User" WHERE email = ANY($1::text[])',
        [emails],
      )
    ).rows.map((row) => row.id);
    for (const table of ["Transaction", "Category", "FinancialAccount"]) {
      await client.query(
        `DELETE FROM "${table}" WHERE "userId" = ANY($1::text[])`,
        [ids],
      );
    }
    await client.query('DELETE FROM "User" WHERE id = ANY($1::text[])', [ids]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
});

test("milestone: authentication, real balances, CRUD, filters, and two-user isolation", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const pageErrors: string[] = [];
  a.on("pageerror", (error) => pageErrors.push(error.name));
  b.on("pageerror", (error) => pageErrors.push(error.name));
  try {
    await test.step("Registration, logout, protected redirect, and password login", async () => {
      await register(a, emails[0]);
      await a.getByRole("button", { name: "Log out", exact: true }).click();
      await expect(a).toHaveURL(/\/login$/);
      await a.goto("/dashboard/accounts");
      await expect(a).toHaveURL(/\/login$/);
      await a.getByLabel("Email address").fill(emails[0]);
      await enterPassword(a);
      await a.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(a).toHaveURL(/\/dashboard$/);
    });
    await test.step("Create accounts, categories, income, and expense; verify ₹6,500", async () => {
      await account(a, "Test Bank A", "5000");
      await category(a, "Test Income A", "INCOME");
      await category(a, "Test Expense A", "EXPENSE");
      await addTransaction(
        a,
        "Test income A",
        "2000",
        "INCOME",
        "Test Bank A",
        "Test Income A",
      );
      await addTransaction(
        a,
        "Test expense A",
        "500",
        "EXPENSE",
        "Test Bank A",
        "Test Expense A",
      );
      await a.goto("/dashboard/accounts");
      await expect(a.getByText("₹6,500.00", { exact: true })).toBeVisible();
      await a.goto("/dashboard");
      const totals = a.getByRole("region", { name: "Financial totals" });
      for (const amount of ["₹6,500.00", "₹2,000.00", "₹500.00"])
        await expect(totals.getByText(amount, { exact: true })).toBeVisible();
      const amounts = await db.query(
        'SELECT t.amount FROM "Transaction" t JOIN "User" u ON u.id=t."userId" WHERE u.email=$1 ORDER BY t.amount',
        [emails[0]],
      );
      expect(amounts.rows.map((row) => row.amount)).toEqual([50000, 200000]);
    });
    await test.step("Edit and delete expense; verify balances and filters", async () => {
      await a.goto("/dashboard/transactions");
      await a
        .getByRole("button", { name: "Edit Test expense A", exact: true })
        .click();
      const dialog = a.getByRole("dialog", { name: "Edit transaction" });
      await dialog.getByLabel("Amount (₹)", { exact: true }).fill("400");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await expect(dialog).not.toBeVisible();
      await a.goto("/dashboard/accounts");
      await expect(a.getByText("₹6,600.00", { exact: true })).toBeVisible();
      await a.goto("/dashboard/transactions");
      await a.getByLabel("From", { exact: true }).fill("2026-11-02");
      await a.getByLabel("To", { exact: true }).fill("2026-11-02");
      await a.locator('select[name="type"]').selectOption("EXPENSE");
      await a
        .locator('select[name="account"]')
        .selectOption({ label: "Test Bank A" });
      await a
        .locator('select[name="category"]')
        .selectOption({ label: "Test Expense A (expense)" });
      await a.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(
        a.getByText("Test expense A", { exact: true }),
      ).toBeVisible();
      await expect(a.getByText("Test income A", { exact: true })).toHaveCount(
        0,
      );
      a.once("dialog", (dialog) => dialog.accept());
      await a
        .getByRole("button", { name: "Delete Test expense A", exact: true })
        .click();
      await expect(a.getByText("Test expense A", { exact: true })).toHaveCount(
        0,
      );
      await a.goto("/dashboard/accounts");
      await expect(a.getByText("₹7,000.00", { exact: true })).toBeVisible();
      await addTransaction(
        a,
        "Test expense A",
        "500",
        "EXPENSE",
        "Test Bank A",
        "Test Expense A",
      );
    });
    await test.step("Second user's reads do not expose first user's data", async () => {
      await register(b, emails[1]);
      await expect(
        b
          .getByRole("region", { name: "Financial totals" })
          .getByText("₹0.00", { exact: true }),
      ).toHaveCount(3);
      await b.goto("/dashboard/accounts");
      await expect(b.getByText("Test Bank A", { exact: true })).toHaveCount(0);
      await b.goto("/dashboard/categories");
      await expect(b.getByText("Test Expense A", { exact: true })).toHaveCount(
        0,
      );
      await b.goto("/dashboard/transactions");
      await expect(b.getByText("Test income A", { exact: true })).toHaveCount(
        0,
      );
      await account(b, "Test Bank B");
      await category(b, "Test Expense B", "EXPENSE");
      await addTransaction(
        b,
        "Test expense B",
        "10",
        "EXPENSE",
        "Test Bank B",
        "Test Expense B",
      );
    });
    const foreign = (
      await db.query(
        'SELECT t.id, t."accountId", t."categoryId", t.amount FROM "Transaction" t JOIN "User" u ON u.id=t."userId" WHERE u.email=$1 AND t.type=\'EXPENSE\'',
        [emails[0]],
      )
    ).rows[0];
    await test.step("Forged edit/delete IDs and foreign account/category IDs are rejected", async () => {
      await b.goto(
        `/dashboard/transactions?account=${encodeURIComponent(foreign.accountId)}`,
      );
      await expect(b.getByText("Test expense A", { exact: true })).toHaveCount(
        0,
      );
      await expect(b.locator("tbody tr")).toHaveCount(0);
      await b.goto("/dashboard/transactions");
      await b
        .getByRole("button", { name: "Edit Test expense B", exact: true })
        .click();
      let dialog = b.getByRole("dialog", { name: "Edit transaction" });
      await dialog.locator('input[name="id"]').evaluate((element, id) => {
        (element as HTMLInputElement).value = id;
      }, foreign.id);
      await dialog.getByLabel("Amount (₹)", { exact: true }).fill("999");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await expect(dialog.getByRole("alert")).toHaveText(
        "Transaction not found.",
      );
      await dialog.getByRole("button", { name: "Close dialog" }).click();
      const remove = b.getByRole("button", {
        name: "Delete Test expense B",
        exact: true,
      });
      await remove
        .locator("..")
        .locator('input[name="id"]')
        .evaluate((element, id) => {
          (element as HTMLInputElement).value = id;
        }, foreign.id);
      b.once("dialog", (prompt) => prompt.accept());
      await remove.click();
      await expect(b.locator('main p[role="alert"]')).toHaveText(
        "Transaction not found.",
      );
      for (const field of ["accountId", "categoryId"] as const) {
        await b.goto("/dashboard/transactions");
        dialog = await fillTransaction(
          b,
          "Rejected foreign reference",
          "25",
          "EXPENSE",
          "Test Bank B",
          "Test Expense B",
        );
        await injectForeignOption(
          dialog.locator(`select[name="${field}"]`),
          foreign[field],
        );
        await dialog
          .getByRole("button", { name: "Add transaction", exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toHaveText(
          "Choose your own account and a category matching the transaction type.",
        );
        await dialog.getByRole("button", { name: "Close dialog" }).click();
      }
      const unchanged = await db.query(
        'SELECT amount FROM "Transaction" WHERE id=$1',
        [foreign.id],
      );
      expect(unchanged.rows).toEqual([{ amount: 50000 }]);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM "Transaction" t JOIN "User" u ON u.id=t."userId" WHERE u.email=$1',
            [emails[1]],
          )
        ).rows[0].count,
      ).toBe(1);
      await a.reload();
      await expect(a.getByText("Test expense B", { exact: true })).toHaveCount(
        0,
      );
    });
    await test.step("Mobile layout and final balance; logout invalidates session", async () => {
      await a.setViewportSize({ width: 390, height: 844 });
      for (const path of [
        "/dashboard",
        "/dashboard/accounts",
        "/dashboard/categories",
        "/dashboard/transactions",
      ]) {
        await a.goto(path);
        expect(
          await a.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await a.goto("/dashboard/accounts");
      await expect(a.getByText("₹6,500.00", { exact: true })).toBeVisible();
      await a.getByRole("button", { name: "Log out", exact: true }).click();
      await expect(a).toHaveURL(/\/login$/);
      await a.goto("/dashboard");
      await expect(a).toHaveURL(/\/login$/);
      expect(pageErrors).toEqual([]);
    });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
