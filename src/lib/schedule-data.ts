import "server-only";
import { getDb } from "./db";
import { indiaToday, shiftMonth } from "./months";
import {
  scheduleDates,
  eventStatus,
  detectSubscriptions,
  merchantKey,
} from "./schedules";
import type { Prisma } from "@/generated/prisma/client";
export async function lockSchedules(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
}
export async function syncOccurrences(
  tx: Prisma.TransactionClient,
  userId: string,
  through: string,
  resetId?: string,
) {
  const today = indiaToday();
  const bills = await tx.bill.findMany({
    where: { userId, ...(resetId ? { id: resetId } : {}) },
  });
  for (const bill of bills) {
    if (resetId)
      await tx.billOccurrence.updateMany({
        where: {
          billId: bill.id,
          userId,
          dueDate: { gte: new Date(today) },
          payments: { none: { valid: true } },
        },
        data: { cancelled: true },
      });
    if (bill.paused) continue;
    const dates = scheduleDates(
      bill.startDate.toISOString().slice(0, 10),
      bill.recurrence,
      "2000-01-01",
      through,
    );
    const existing = await tx.billOccurrence.findMany({
      where: { billId: bill.id, userId },
      include: { payments: { where: { valid: true } } },
    });
    const byDate = new Map(
      existing.map((o) => [o.scheduledDate.toISOString().slice(0, 10), o]),
    );
    for (const date of dates) {
      const old = byDate.get(date);
      const data = {
        title: bill.title,
        kind: bill.kind,
        amount: bill.amount,
        accountId: bill.accountId,
      };
      if (!old)
        await tx.billOccurrence.create({
          data: {
            ...data,
            userId,
            billId: bill.id,
            scheduledDate: new Date(date),
            dueDate: new Date(date),
          },
        });
      else if (
        resetId &&
        old.dueDate.toISOString().slice(0, 10) >= today &&
        !old.payments.length
      )
        await tx.billOccurrence.update({
          where: { id: old.id },
          data: { ...data, cancelled: false },
        });
    }
  }
}
export function horizon() {
  return shiftMonth(indiaToday().slice(0, 7), 12) + "-28";
}
export async function scheduleData(userId: string, through = horizon()) {
  await getDb().$transaction(
    async (tx) => {
      await lockSchedules(tx, userId);
      await syncOccurrences(tx, userId, through);
    },
    { timeout: 30000 },
  );
  return getDb().billOccurrence.findMany({
    where: { userId },
    include: { payments: { orderBy: { createdAt: "desc" } }, bill: true },
    orderBy: { dueDate: "asc" },
  });
}
export async function recurringSuggestions(userId: string) {
  const db = getDb();
  const [transactions, subs, dismissals] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        reversal: null,
        OR:[{accountingEffect:null},{accountingEffect:"EXPENSE"}],
        date: { lte: new Date(indiaToday()) },
      },
      orderBy: { date: "desc" },
      take: 2000,
    }),
    db.subscription.findMany({ where: { userId } }),
    db.subscriptionDismissal.findMany({ where: { userId } }),
  ]);
  return detectSubscriptions(
    transactions.map((t) => ({
      ...t,
      date: t.date.toISOString().slice(0, 10),
    })),
    [
      ...subs.flatMap((s) => [s.merchant, merchantKey(s.name)]),
      ...dismissals.map((d) => d.merchant),
    ],
  );
}
export type CalendarItem = {
  id: string;
  title: string;
  date: string;
  amount: number;
  status: string;
  href: string;
  subscription: boolean;
};
export async function calendarItems(userId: string, from: string, to: string) {
  const [occurrences, subs] = await Promise.all([
    scheduleData(userId, to),
    getDb().subscription.findMany({
      where: { userId, paused: false },
      include: { bill: true },
    }),
  ]);
  const today = indiaToday();
  const items: CalendarItem[] = occurrences
    .filter(
      (o) =>
        !o.cancelled &&
        o.dueDate.toISOString().slice(0, 10) >= from &&
        o.dueDate.toISOString().slice(0, 10) <= to,
    )
    .map((o) => ({
      id: o.id,
      title: o.title,
      date: o.dueDate.toISOString().slice(0, 10),
      amount: o.amount,
      status: eventStatus(
        o.dueDate.toISOString().slice(0, 10),
        o.payments.some((p) => p.valid),
        today,
      ),
      href: "/dashboard/bills/" + o.id,
      subscription: false,
    }));
  for (const sub of subs) {
    if (sub.bill) continue;
    for (const date of scheduleDates(
      sub.nextRenewal.toISOString().slice(0, 10),
      sub.frequency,
      from,
      to,
    ))
      items.push({
        id: sub.id + date,
        title: sub.name,
        date,
        amount: sub.amount,
        status:
          date < today
            ? "Renewal passed · verify"
            : date === today
              ? "Renews today"
              : "Renewal estimate",
        href: "/dashboard/subscriptions/" + sub.id,
        subscription: true,
      });
  }
  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}
