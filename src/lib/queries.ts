import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
export async function options(userId: string) {
  const [accounts, categories] = await Promise.all([
    getDb().financialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    getDb().category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);
  return { accounts, categories };
}
export async function totals(userId: string) {
  const db = getDb();
  const [opening, grouped] = await db.$transaction([
    db.financialAccount.aggregate({
      where: { userId },
      _sum: { openingBalance: true },
    }),
    db.transaction.groupBy({
      by: ["type"],
      orderBy: { type: "asc" },
      where: { userId },
      _sum: { amount: true },
    }),
  ]);
  const income = grouped.find((g) => g.type === "INCOME")?._sum?.amount ?? 0;
  const expense = grouped.find((g) => g.type === "EXPENSE")?._sum?.amount ?? 0;
  const reversals = await db.transaction.aggregate({
    where: { userId, reversalOfId: { not: null } },
    _sum: { amount: true },
  });
  const refunded = reversals._sum.amount ?? 0;
  const expenseRefunds = await db.transaction.aggregate({
    where: {
      userId,
      reversalOfId: { not: null },
      reversalOf: {
        OR: [{ accountingEffect: null }, { accountingEffect: "EXPENSE" }],
      },
    },
    _sum: { amount: true },
  });
  const unclassified = await db.transaction.groupBy({
    by: ["type"],
    where: { userId, accountingEffect: "NEUTRAL", reversalOfId: null },
    _sum: { amount: true },
  });
  const neutralIncome =
    unclassified.find((r) => r.type === "INCOME")?._sum.amount ?? 0;
  const neutralExpense =
    unclassified.find((r) => r.type === "EXPENSE")?._sum.amount ?? 0;
  return {
    income: income - refunded - neutralIncome,
    expense: expense - (expenseRefunds._sum.amount ?? 0) - neutralExpense,
    opening: opening._sum.openingBalance ?? 0,
    cashBalance: (opening._sum.openingBalance ?? 0) + income - expense,
    reviewCount: await db.transaction.count({
      where: {
        userId,
        OR: [
          { classification: { path: ["review"], equals: true } },
          {
            classification: { equals: Prisma.DbNull },
            sliceEntries: { some: {} },
          },
        ],
      },
    }),
  };
}
