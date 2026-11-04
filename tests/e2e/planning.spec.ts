import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Pool } from "pg";
import { currentMonth, shiftMonth, indiaToday } from "../../src/lib/months";

const tag = randomBytes(8).toString("hex");
const emails = [`ft-m2-${tag}-a@example.test`, `ft-m2-${tag}-b@example.test`];
const password = randomBytes(24).toString("hex");
const db = new Pool({
  connectionString: parse(readFileSync(".env", "utf8")).DATABASE_URL,
});
const now = new Date();
const month = currentMonth(now),
  baseline = shiftMonth(month, -1);
const accountId = randomUUID(),
  categoryId = randomUUID(),
  incomeCategoryId = randomUUID();
const expenseId = randomUUID();
async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Planning test");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .evaluate((element, value) => {
      (element as HTMLInputElement).value = value;
    }, password);
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
async function setBudget(page: Page, amount: string, category = "") {
  const form = page.getByRole("form", { name: "Set budget", exact: true });
  await form.locator('select[name="categoryId"]').selectOption(category);
  await form.getByLabel("Monthly limit (₹)").fill(amount);
  await form.getByRole("button", { name: "Set budget", exact: true }).click();
}
async function createGoal(page: Page, name: string) {
  const form = page.getByRole("form", { name: "Create goal", exact: true });
  await form.getByLabel("Goal name").fill(name);
  await form.getByLabel("Target amount (₹)").fill("10000");
  await form.getByRole("button", { name: "Create goal", exact: true }).click();
  await expect(
    page.getByRole("article", { name: `${name} goal`, exact: true }),
  ).toBeVisible();
}
async function hidden(locator: Locator, value: string) {
  await locator.evaluate((element, value) => {
    (element as HTMLInputElement).value = value;
  }, value);
}
async function totals(userId: string) {
  return (
    await db.query(
      'SELECT type, sum(amount)::text AS amount FROM "Transaction" WHERE "userId"=$1 GROUP BY type ORDER BY type',
      [userId],
    )
  ).rows;
}
test.afterAll(async () => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const ids = (
      await client.query('SELECT id FROM "User" WHERE email=ANY($1::text[])', [
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
      await client.query(
        `DELETE FROM "${table}" WHERE "userId"=ANY($1::text[])`,
        [ids],
      );
    await client.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
});

test("milestone 2: live charts and budgets, allocations, comparisons, and isolation", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.name));
  b.on("pageerror", (e) => errors.push(e.name));
  try {
    await register(a, emails[0]);
    const userId = (
      await db.query('SELECT id FROM "User" WHERE email=$1', [emails[0]])
    ).rows[0].id;
    await test.step("Seed only the isolated test user's calendar-boundary records", async () => {
      await db.query(
        'INSERT INTO "FinancialAccount" (id,"userId",name,type,"openingBalance") VALUES ($1,$2,\'Planning bank\',\'BANK\',500000)',
        [accountId, userId],
      );
      await db.query(
        "INSERT INTO \"Category\" (id,\"userId\",name,type) VALUES ($1,$2,'Planning food','EXPENSE'),($3,$2,'Planning salary','INCOME')",
        [categoryId, userId, incomeCategoryId],
      );
      const priorEnd = new Date(`${month}-01T00:00:00Z`);
      priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
      const tomorrow = new Date(`${indiaToday(now)}T00:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      for (const [id, type, cat, amount, date, description] of [
        [
          expenseId,
          "EXPENSE",
          categoryId,
          80000,
          `${month}-01`,
          "Planning expense",
        ],
        [
          randomUUID(),
          "INCOME",
          incomeCategoryId,
          200000,
          `${month}-01`,
          "Planning income",
        ],
        [
          randomUUID(),
          "EXPENSE",
          categoryId,
          40000,
          priorEnd.toISOString().slice(0, 10),
          "Prior month expense",
        ],
        [
          randomUUID(),
          "EXPENSE",
          categoryId,
          9999900,
          tomorrow.toISOString().slice(0, 10),
          "Future expense",
        ],
      ])
        await db.query(
          'INSERT INTO "Transaction" (id,"userId","accountId","categoryId",type,amount,date,description,"updatedAt") VALUES ($1,$2,$3,$4,$5::"TransactionType",$6,$7::date,$8,now())',
          [id, userId, accountId, cat, type, amount, date, description],
        );
    });
    await test.step("Actual chart values, MTD cutoff, independent budgets, and thresholds", async () => {
      await a.goto("/dashboard");
      await expect(
        a
          .getByRole("region", { name: "Expense breakdown", exact: true })
          .getByText("₹800.00", { exact: true }),
      ).toBeVisible();
      await expect(
        a
          .getByRole("region", { name: "Expense breakdown", exact: true })
          .locator(".recharts-surface"),
      ).toBeVisible();
      const flow = a.getByRole("region", { name: "Monthly cash flow" });
      await expect(
        flow.locator('.recharts-surface[role="application"]'),
      ).toBeVisible();
      await flow.getByText("View monthly chart values").click();
      await expect(
        flow.getByRole("row").filter({ hasText: "month-to-date" }),
      ).toContainText("₹2,000.00");
      await a.goto("/dashboard/budgets");
      await setBudget(a, "1000");
      const overall = a.getByRole("article", {
        name: "Overall expenses budget",
        exact: true,
      });
      await expect(overall).toContainText("80% used");
      await expect(overall).toContainText("Approaching limit");
      await setBudget(a, "1000", categoryId);
      await expect(
        a.getByRole("article", { name: "Planning food budget", exact: true }),
      ).toContainText("80% used");
      await expect(overall).toContainText("₹200.00 remaining");
      await overall.getByText("Edit budget", { exact: true }).click();
      const edit = overall.getByRole("form", {
        name: "Edit budget",
        exact: true,
      });
      await edit.getByLabel("Monthly limit (₹)").fill("2000");
      await edit.getByRole("button", { name: "Save budget" }).click();
      await expect(overall).toContainText("40% used");
      await edit.getByLabel("Monthly limit (₹)").fill("1000");
      await edit.getByRole("button", { name: "Save budget" }).click();
      await expect(overall).toContainText("80% used");
    });
    await test.step("Transaction edit and deletion refresh both chart data and budget usage", async () => {
      await a.goto("/dashboard/transactions");
      await a
        .getByRole("button", { name: "Edit Planning expense", exact: true })
        .click();
      const dialog = a.getByRole("dialog", {
        name: "Edit transaction",
        exact: true,
      });
      await dialog.getByLabel("Amount (₹)", { exact: true }).fill("1100");
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await expect(dialog).not.toBeVisible();
      await a.getByRole("link", { name: "Budgets", exact: true }).click();
      const overall = a.getByRole("article", {
        name: "Overall expenses budget",
        exact: true,
      });
      await expect(overall).toContainText("110% used");
      await expect(overall).toContainText("₹100.00 over budget");
      await a.getByRole("link", { name: "Overview", exact: true }).click();
      await expect(
        a
          .getByRole("region", { name: "Expense breakdown", exact: true })
          .getByText("₹1,100.00", { exact: true }),
      ).toBeVisible();
      await a.getByRole("link", { name: "Transactions", exact: true }).click();
      a.once("dialog", (d) => d.accept());
      await a
        .getByRole("button", { name: "Delete Planning expense", exact: true })
        .click();
      await expect(
        a.getByText("Planning expense", { exact: true }),
      ).toHaveCount(0);
      await a.getByRole("link", { name: "Budgets", exact: true }).click();
      await expect(overall).toContainText("0% used");
      await a.getByRole("link", { name: "Overview", exact: true }).click();
      await expect(
        a.getByRole("region", { name: "Expense breakdown", exact: true }),
      ).toContainText("No expenses in this month yet");
    });
    await test.step("Comparisons handle zero baselines and date boundaries", async () => {
      await a.goto(
        `/dashboard/comparisons?month=${month}&baseline=${baseline}`,
      );
      const table = a.getByRole("table", {
        name: "Monthly comparison",
        exact: true,
      });
      await expect(table).toContainText("month-to-date");
      await expect(
        table.getByRole("row").filter({
          has: a.getByRole("cell", { name: "Income", exact: true }),
        }),
      ).toContainText("No percentage: baseline is zero");
      const expense = table.getByRole("row").filter({
        has: a.getByRole("cell", { name: "Expenses", exact: true }),
      });
      await expect(expense).toContainText("₹400.00");
      await expect(expense).toContainText("-100%");
      await expect(
        a.getByRole("table", { name: "Category comparison", exact: true }),
      ).toContainText("Planning food");
    });
    let contributionId: string, goalId: string;
    await test.step("Goal creation/editing and allocations leave transaction totals unchanged", async () => {
      const before = await totals(userId);
      await a.goto("/dashboard/goals");
      await expect(
        a.getByText(/Contributions are goal allocations only/),
      ).toBeVisible();
      await createGoal(a, "Planning trip");
      let goal = a.getByRole("article", {
        name: "Planning trip goal",
        exact: true,
      });
      await goal.getByLabel("Allocation amount (₹)").fill("500");
      await goal
        .getByRole("button", { name: "Add allocation", exact: true })
        .click();
      await expect(goal).toContainText("5% funded");
      await goal.getByText("Edit goal", { exact: true }).click();
      const edit = goal.getByRole("form", { name: "Edit goal", exact: true });
      await edit.getByLabel("Goal name").fill("Planning holiday");
      await edit.getByLabel("Target amount (₹)").fill("20000");
      await edit
        .getByLabel("Deadline (optional)")
        .fill(`${shiftMonth(month, 2)}-01`);
      await edit
        .getByRole("button", { name: "Save goal", exact: true })
        .click();
      goal = a.getByRole("article", {
        name: "Planning holiday goal",
        exact: true,
      });
      await expect(goal).toContainText("2.5% funded");
      await expect(goal).toContainText("₹19,500.00 remaining");
      expect(await totals(userId)).toEqual(before);
      const record = (
        await db.query(
          'SELECT id,"goalId" FROM "GoalContribution" WHERE "userId"=$1',
          [userId],
        )
      ).rows[0];
      contributionId = record.id;
      goalId = record.goalId;
    });
    await test.step("Second user cannot read or modify another user's planning records", async () => {
      await register(b, emails[1]);
      await b.goto("/dashboard/budgets");
      await expect(b.getByRole("article")).toHaveCount(0);
      await setBudget(b, "200");
      const ownBudget = b.getByRole("article", {
        name: "Overall expenses budget",
        exact: true,
      });
      await expect(ownBudget).toContainText("0% used");
      await ownBudget.getByText("Edit budget", { exact: true }).click();
      const foreignBudget = (
        await db.query(
          'SELECT id FROM "Budget" WHERE "userId"=$1 AND scope=\'overall\'',
          [userId],
        )
      ).rows[0].id;
      const edit = ownBudget.getByRole("form", {
        name: "Edit budget",
        exact: true,
      });
      await hidden(edit.locator('input[name="id"]'), foreignBudget);
      await edit.getByLabel("Monthly limit (₹)").fill("1");
      await edit.getByRole("button", { name: "Save budget" }).click();
      await expect(edit.getByRole("alert")).toHaveText("Budget not found.");
      const create = b.getByRole("form", { name: "Set budget", exact: true });
      await create.locator("select").evaluate((el, value) => {
        (el as HTMLSelectElement).add(new Option("Foreign category", value));
      }, categoryId);
      await setBudget(b, "1", categoryId);
      await expect(create.getByRole("alert")).toHaveText(
        "Choose your own expense category.",
      );
      await b.goto("/dashboard/goals");
      await expect(b.getByRole("article")).toHaveCount(0);
      await createGoal(b, "Other goal");
      const own = b.getByRole("article", {
        name: "Other goal goal",
        exact: true,
      });
      await own.getByLabel("Allocation amount (₹)").fill("100");
      await own
        .getByRole("button", { name: "Add allocation", exact: true })
        .click();
      await expect(own).toContainText("1% funded");
      await own.getByText("Edit goal", { exact: true }).click();
      const goalEdit = own.getByRole("form", {
        name: "Edit goal",
        exact: true,
      });
      await hidden(goalEdit.locator('input[name="id"]'), goalId);
      await goalEdit.getByRole("button", { name: "Save goal" }).click();
      await expect(goalEdit.getByRole("alert")).toHaveText("Goal not found.");
      const allocationForm = own
        .getByRole("button", { name: "Add allocation", exact: true })
        .locator("..");
      await hidden(allocationForm.locator('input[name="goalId"]'), goalId);
      await allocationForm.getByLabel("Allocation amount (₹)").fill("99");
      await allocationForm
        .getByRole("button", { name: "Add allocation", exact: true })
        .click();
      await expect(allocationForm.getByRole("alert")).toHaveText(
        "Goal not found.",
      );
      await own.getByText("Allocations (1)", { exact: true }).click();
      const remove = own
        .getByRole("button", { name: "Remove allocation", exact: true })
        .locator("..");
      await hidden(remove.locator('input[name="id"]'), contributionId);
      b.once("dialog", (d) => d.accept());
      await remove.getByRole("button").click();
      await expect(remove.getByRole("alert")).toHaveText(
        "Allocation not found.",
      );
      const deletion = own
        .getByRole("button", { name: "Delete goal", exact: true })
        .locator("..");
      await hidden(deletion.locator('input[name="id"]'), goalId);
      b.once("dialog", (d) => d.accept());
      await deletion.getByRole("button").click();
      await expect(deletion.getByRole("alert")).toHaveText("Goal not found.");
      expect(
        (
          await db.query('SELECT amount FROM "Budget" WHERE id=$1', [
            foreignBudget,
          ])
        ).rows[0].amount,
      ).toBe(100000);
      expect(
        (
          await db.query('SELECT target FROM "SavingsGoal" WHERE id=$1', [
            goalId,
          ])
        ).rows[0].target,
      ).toBe(2000000);
      expect(
        (
          await db.query('SELECT amount FROM "GoalContribution" WHERE id=$1', [
            contributionId,
          ])
        ).rows[0].amount,
      ).toBe(50000);
    });
    await test.step("Removing allocations and deleting a goal preserve financial totals", async () => {
      const before = await totals(userId);
      await a.goto("/dashboard/goals");
      const goal = a.getByRole("article", {
        name: "Planning holiday goal",
        exact: true,
      });
      await goal.getByText("Allocations (1)", { exact: true }).click();
      a.once("dialog", (d) => d.accept());
      await goal
        .getByRole("button", { name: "Remove allocation", exact: true })
        .click();
      await expect(goal).toContainText("0% funded");
      await goal.getByLabel("Allocation amount (₹)").fill("50");
      await goal
        .getByRole("button", { name: "Add allocation", exact: true })
        .click();
      await expect(goal).toContainText("0.25% funded");
      a.once("dialog", (d) => d.accept());
      await goal
        .getByRole("button", { name: "Delete goal", exact: true })
        .click();
      await expect(goal).toHaveCount(0);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM "GoalContribution" WHERE "goalId"=$1',
            [goalId],
          )
        ).rows[0].count,
      ).toBe(0);
      expect(await totals(userId)).toEqual(before);
      await a.setViewportSize({ width: 390, height: 844 });
      for (const path of [
        "/dashboard",
        "/dashboard/budgets",
        "/dashboard/goals",
        "/dashboard/comparisons",
      ]) {
        await a.goto(path);
        expect(
          await a.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  } finally {
    await ca.close();
    await cb.close();
  }
});
