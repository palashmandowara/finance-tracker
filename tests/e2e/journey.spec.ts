import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";
const tag = randomBytes(8).toString("hex");
const emails = [`ledger-${tag}-a@example.test`, `ledger-${tag}-b@example.test`];
const password = randomBytes(24).toString("hex");
const db = new Pool({
  connectionString: parse(readFileSync(".env", "utf8")).DATABASE_URL,
});
async function secret(page: Page, label = "Password", value = password) {
  await page.getByLabel(label, { exact: true }).evaluate((e, v) => {
    (e as HTMLInputElement).value = v;
  }, value);
}
async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Sample");
  await page.getByLabel("Email address").fill(email);
  await secret(page);
  await secret(page, "Confirm password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/setup$/);
}
test.afterAll(async () => {
  const ids = (
    await db.query('SELECT id FROM "User" WHERE email=ANY($1::text[])', [
      emails,
    ])
  ).rows.map((r) => r.id);
  for (const table of [
    "Budget",
    "GoalContribution",
    "SavingsGoal",
    "Transaction",
    "Category",
    "FinancialAccount",
  ])
    await db.query(`DELETE FROM "${table}" WHERE "userId"=ANY($1::text[])`, [
      ids,
    ]);
  await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
  await db.end();
});
test("Ledger journey: registration, setup, profile, returning users and responsive screens", async ({
  browser,
}) => {
  test.setTimeout(300000);
  mkdirSync("design/qa", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /A little clarity/ }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", { name: /Create account/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/register$/);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    expect(
      await page
        .locator("input[name=name]")
        .evaluate((e) => (e as HTMLInputElement).validity.valueMissing),
    ).toBe(true);
    await page.getByLabel("Your name").fill("Sample");
    await page.getByLabel("Email address").fill(emails[0]);
    await secret(page);
    await secret(page, "Confirm password", password + "x");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.locator("p[role=alert]")).toHaveText(
      "Passwords do not match.",
    );
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(page.locator("#password")).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Hide password", exact: true })
      .click();
    await secret(page, "Confirm password");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/setup$/);
    await expect(
      page.getByText(/manually tracked financial account/),
    ).toBeVisible();
    await page.getByLabel("Account name").fill("Everyday account");
    await page.getByLabel("Opening balance (₹)", { exact: true }).fill("5000");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("region", { name: "Financial totals" }),
    ).toContainText("₹5,000.00");
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/dashboard$/);
    const user = (
      await db.query('SELECT id FROM "User" WHERE email=$1', [emails[0]])
    ).rows[0];
    // Seed only the isolated preview user for the public product screenshot.
    const aid = (
      await db.query('SELECT id FROM "FinancialAccount" WHERE "userId"=$1', [
        user.id,
      ])
    ).rows[0].id;
    for (const [type, name, amount, description] of [
      ["INCOME", "Income", 200000, "Freelance project"],
      ["EXPENSE", "Food & drinks", 50000, "Groceries"],
    ] as const) {
      const id = randomBytes(16).toString("hex");
      await db.query(
        'INSERT INTO "Category" (id,"userId",name,type) VALUES ($1,$2,$3,$4)',
        [id, user.id, name, type],
      );
      await db.query(
        'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,description,amount,date,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,NOW(),NOW())',
        [
          randomBytes(16).toString("hex"),
          user.id,
          aid,
          id,
          type,
          description,
          amount,
        ],
      );
    }
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Financial totals" }),
    ).toContainText("₹6,500.00");
    await page.locator(".recharts-surface").first().waitFor();
    await page.screenshot({ path: "design/qa/dashboard-desktop.png" });
    await page.screenshot({
      path: "design/qa/product-preview.png",
      clip: { x: 240, y: 0, width: 1200, height: 850 },
    });
    copyFileSync("design/qa/product-preview.png", "public/product-preview.png");
    await page.goto("/dashboard/settings");
    await page.getByLabel("Your name").fill("   ");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("Enter your name.");
    await page.getByLabel("Your name").fill("Ledger updated");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Your name has been updated.",
    );
    await page.reload();
    await expect(page.getByLabel("Your name")).toHaveValue("Ledger updated");
    expect(
      (await db.query('SELECT name FROM "User" WHERE id=$1', [user.id])).rows[0]
        .name,
    ).toBe("Ledger updated");
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /Open dashboard/ }).first(),
    ).toBeVisible();
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      for (const route of [
        "/",
        "/login",
        "/register",
        "/dashboard",
        "/dashboard/accounts",
        "/dashboard/categories",
        "/dashboard/transactions",
        "/dashboard/budgets",
        "/dashboard/goals",
        "/dashboard/comparisons",
        "/dashboard/settings",
      ]) {
        await page.goto(route);
        await expect(page.locator("h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} at ${width}`,
        ).toBe(true);
        if (
          (width === 390 || width === 1440) &&
          ["/", "/login", "/register", "/dashboard/settings"].includes(route)
        )
          await page.screenshot({
            path: `design/qa/${route.replaceAll("/", "-") || "home"}-${width}.png`,
            fullPage: true,
          });
      }
    }
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    for (const route of ["/setup", "/dashboard/settings", "/dashboard"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
    }
    await page.getByLabel("Email address").fill(emails[0]);
    await secret(page, "Password", password + "wrong");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(
      "Could not sign in",
    );
    await secret(page);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Hello, Ledger." }),
    ).toBeVisible();
    const other = await browser.newContext();
    const b = await other.newPage();
    await register(b, emails[1]);
    await b.setViewportSize({ width: 390, height: 844 });
    await b.screenshot({ path: "design/qa/setup-mobile.png", fullPage: true });
    await b.getByRole("link", { name: "Skip for now" }).click();
    await expect(b).toHaveURL(/\/dashboard$/);
    await b.goto("/dashboard/settings");
    await b.getByRole("link", { name: "Complete account setup" }).click();
    await expect(b).toHaveURL(/\/setup$/);
    await b.goto("/dashboard/settings");
    await b.getByLabel("Your name").fill("Second user");
    await b.locator("form").evaluate((form, id) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "userId";
      input.value = id;
      form.append(input);
    }, user.id);
    await b.getByRole("button", { name: "Save name" }).click();
    await expect(b.getByRole("status")).toBeVisible();
    expect(
      (await db.query('SELECT name FROM "User" WHERE id=$1', [user.id])).rows[0]
        .name,
    ).toBe("Ledger updated");
    await b.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(b).toHaveURL(/\/login$/);
    const response = await b.request.post("/api/auth/update-user", {
      data: { name: "Unauthorized" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(response.ok()).toBe(false);
    await b.getByLabel("Email address").fill(emails[1]);
    await secret(b);
    await b.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(b).toHaveURL(/\/dashboard$/);
    const invalidName = await b.request.post("/api/auth/update-user", {
      data: { name: " ".repeat(5) },
      headers: { origin: "http://localhost:3000" },
    });
    expect(invalidName.ok()).toBe(false);
    await other.close();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
