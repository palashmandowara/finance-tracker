import "server-only";
import { getDb } from "./db";
import { monthRange, monthLabel, shiftMonth } from "./months";

export async function monthReport(
  userId: string,
  month: string,
  now = new Date(),
) {
  // Explicit allowlist: allocations, transfers and card repayments are not expenses.
  const groups = await getDb().transaction.groupBy({
    by: ["categoryId", "type"],
    where: {
      userId,
      type: { in: ["INCOME", "EXPENSE"] },
      reversalOfId: null,
      OR: [
        { accountingEffect: null },
        { accountingEffect: { in: ["INCOME", "EXPENSE"] } },
      ],
      date: monthRange(month, now),
    },
    _sum: { amount: true },
    orderBy: { categoryId: "asc" },
  });
  let income = 0,
    expense = 0;
  const categories: Record<string, number> = {};
  for (const row of groups) {
    const value = row._sum.amount ?? 0;
    if (row.type === "INCOME") income += value;
    else if (row.type === "EXPENSE") {
      expense += value;
      categories[row.categoryId] = value;
    }
  }
  const refunds = await getDb().transaction.findMany({
    where: {
      userId,
      reversalOfId: { not: null },
      date: monthRange(month, now),
    },
    include: {
      reversalOf: { select: { categoryId: true, accountingEffect: true } },
    },
  });
  for (const refund of refunds) {
    if (refund.reversalOf?.accountingEffect === "NEUTRAL") continue;
    expense -= refund.amount;
    const category = refund.reversalOf!.categoryId;
    categories[category] = (categories[category] ?? 0) - refund.amount;
  }
  return {
    month,
    label: monthLabel(month, now),
    income,
    expense,
    net: income - expense,
    categories,
  };
}
export async function chartReports(
  userId: string,
  month: string,
  now = new Date(),
) {
  return Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      monthReport(userId, shiftMonth(month, i - 5), now),
    ),
  );
}
