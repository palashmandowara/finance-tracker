"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  subscriptionSchema,
  billSchema,
  scheduleDate,
  merchantKey,
} from "@/lib/schedules";
import {
  lockSchedules,
  syncOccurrences,
  horizon,
  recurringSuggestions,
} from "@/lib/schedule-data";
import { transactionSchema, money } from "@/lib/validation";
import { transferSchema } from "@/lib/statements";
import { indiaToday } from "@/lib/months";
import type { Result } from "./actions";
import type { Prisma } from "@/generated/prisma/client";
function refresh() {
  revalidatePath("/dashboard", "layout");
}
function fail(e: unknown): Result {
  return {
    error:
      e instanceof Error && e.message.startsWith("Please ")
        ? e.message
        : "Could not save. Check your details and try again.",
  };
}
async function ownership(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string | null,
  categoryId?: string | null,
) {
  if (
    accountId &&
    !(await tx.financialAccount.findFirst({ where: { id: accountId, userId } }))
  )
    throw new Error("Please choose your own account.");
  if (
    categoryId &&
    !(await tx.category.findFirst({
      where: { id: categoryId, userId, type: "EXPENSE" },
    }))
  )
    throw new Error("Please choose your own expense category.");
}
const idFrom = (form: FormData) => {
  const id = form.get("id");
  return typeof id === "string" && id.length <= 100 ? id : "";
};
export async function saveSubscription(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = idFrom(form);
  try {
    await getDb().$transaction(
      async (tx) => {
        await lockSchedules(tx, user.id);
        const d = parsed.data;
        await ownership(tx, user.id, d.accountId, d.categoryId);
        const existing = id
          ? await tx.subscription.findFirst({
              where: { id, userId: user.id },
              include: { bill: true },
            })
          : null;
        if (id && !existing)
          throw new Error("Please select your own subscription.");
        const data = {
          ...d,
          nextRenewal: new Date(d.nextRenewal),
          merchant: existing?.merchant || merchantKey(d.name),
        };
        if (existing) {
          await tx.subscription.update({ where: { id }, data });
          if (existing.bill) {
            await tx.bill.update({
              where: { id: existing.bill.id },
              data: {
                title: d.name,
                amount: d.amount,
                accountId: d.accountId,
                recurrence: d.frequency,
                startDate: new Date(d.nextRenewal),
              },
            });
            await syncOccurrences(tx, user.id, horizon(), existing.bill.id);
          }
        } else
          await tx.subscription.create({ data: { ...data, userId: user.id } });
      },
      { timeout: 30000 },
    );
    refresh();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
export async function subscriptionCommand(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const id = idFrom(form),
    command = form.get("command");
  if (!["pause", "resume", "delete", "bill"].includes(String(command)))
    return { error: "Invalid command." };
  try {
    await getDb().$transaction(
      async (tx) => {
        await lockSchedules(tx, user.id);
        const s = await tx.subscription.findFirst({
          where: { id, userId: user.id },
          include: { bill: true },
        });
        if (!s) throw new Error("Please select your own subscription.");
        if (command === "bill") {
          if (!s.bill) {
            const bill = await tx.bill.create({
              data: {
                userId: user.id,
                title: s.name,
                amount: s.amount,
                kind: "OTHER",
                accountId: s.accountId,
                recurrence: s.frequency,
                startDate: s.nextRenewal,
                paused: s.paused,
                subscriptionId: s.id,
              },
            });
            await syncOccurrences(tx, user.id, horizon(), bill.id);
          }
          return;
        }
        if (command === "delete") {
          await tx.subscriptionDismissal.upsert({
            where: {
              userId_merchant: { userId: user.id, merchant: s.merchant },
            },
            create: { userId: user.id, merchant: s.merchant },
            update: {},
          });
          if (s.bill) {
            await tx.bill.update({
              where: { id: s.bill.id },
              data: { paused: true },
            });
            await syncOccurrences(tx, user.id, horizon(), s.bill.id);
          }
          await tx.subscription.delete({ where: { id } });
        } else {
          const paused = command === "pause";
          await tx.subscription.update({ where: { id }, data: { paused } });
          if (s.bill) {
            await tx.bill.update({
              where: { id: s.bill.id },
              data: { paused },
            });
            await syncOccurrences(tx, user.id, horizon(), s.bill.id);
          }
        }
      },
      { timeout: 30000 },
    );
  } catch (e) {
    return fail(e);
  }
  refresh();
  if (command === "delete") redirect("/dashboard/subscriptions");
  return { success: true };
}
export async function suggestionCommand(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const merchant = form.get("merchant"),
    command = form.get("command");
  if (
    typeof merchant !== "string" ||
    merchant.length > 160 ||
    !["confirm", "dismiss"].includes(String(command))
  )
    return { error: "Invalid suggestion." };
  const found = (await recurringSuggestions(user.id)).find(
    (s) => s.merchant === merchant,
  );
  if (!found)
    return { error: "Suggestion already handled or no longer available." };
  try {
    await getDb().$transaction(async (tx) => {
      await lockSchedules(tx, user.id);
      if (
        (await tx.subscription.findFirst({
          where: { userId: user.id, merchant },
        })) ||
        (await tx.subscriptionDismissal.findUnique({
          where: { userId_merchant: { userId: user.id, merchant } },
        }))
      )
        return;
      if (command === "dismiss")
        await tx.subscriptionDismissal.create({
          data: { userId: user.id, merchant },
        });
      else
        await tx.subscription.create({
          data: {
            userId: user.id,
            merchant,
            name: found.name.slice(0, 80),
            amount: found.amount,
            frequency: found.frequency,
            nextRenewal: new Date(found.nextRenewal),
            accountId: found.accountId,
            categoryId: found.categoryId,
          },
        });
    });
    refresh();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
export async function saveBill(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = billSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = idFrom(form);
  try {
    await getDb().$transaction(
      async (tx) => {
        await lockSchedules(tx, user.id);
        const d = parsed.data;
        await ownership(tx, user.id, d.accountId);
        if (
          d.kind === "CREDIT_CARD" &&
          d.accountId &&
          !(await tx.financialAccount.findFirst({
            where: { id: d.accountId, userId: user.id, type: "CREDIT_CARD" },
          }))
        )
          throw new Error(
            "Please choose the credit-card account for this bill.",
          );
        const old = id
          ? await tx.bill.findFirst({ where: { id, userId: user.id } })
          : null;
        if (id && !old) throw new Error("Please select your own bill.");
        if (old?.subscriptionId)
          throw new Error("Please edit this schedule from its subscription.");
        const data = { ...d, startDate: new Date(d.startDate) };
        const bill = old
          ? await tx.bill.update({ where: { id }, data })
          : await tx.bill.create({ data: { ...data, userId: user.id } });
        await syncOccurrences(tx, user.id, horizon(), bill.id);
      },
      { timeout: 30000 },
    );
    refresh();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
export async function editOccurrence(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const id = idFrom(form),
    amount = money.safeParse(form.get("amount")),
    date = scheduleDate.safeParse(form.get("dueDate"));
  if (!amount.success || !date.success)
    return { error: "Enter a valid amount and due date." };
  try {
    await getDb().$transaction(async (tx) => {
      await lockSchedules(tx, user.id);
      const o = await tx.billOccurrence.findFirst({
        where: { id, userId: user.id },
        include: { payments: { where: { valid: true } } },
      });
      if (!o || o.payments.length || o.cancelled)
        throw new Error("Please select an unpaid occurrence you own.");
      await tx.billOccurrence.update({
        where: { id },
        data: { amount: amount.data, dueDate: new Date(date.data) },
      });
    });
    refresh();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
export async function payBill(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const id = idFrom(form),
    mode = form.get("mode");
  if (!["link", "new"].includes(String(mode)))
    return { error: "Choose an explicit payment action." };
  try {
    await getDb().$transaction(
      async (tx) => {
        await lockSchedules(tx, user.id);
        const o = await tx.billOccurrence.findFirst({
          where: { id, userId: user.id },
          include: { payments: { where: { valid: true } } },
        });
        if (!o || o.cancelled)
          throw new Error("Please select your own active bill occurrence.");
        if (o.payments.length) return;
        const recordId = String(form.get("recordId") || "");
        let transactionId: string | null = null,
          transferId: string | null = null,
          paymentDate: Date;
        const credit = o.kind === "CREDIT_CARD";
        if (mode === "link") {
          if (!recordId || recordId.length > 100)
            throw new Error("Please choose a valid payment.");
          if (credit)
            await tx.$queryRaw`SELECT id FROM "Transfer" WHERE id=${recordId} AND "userId"=${user.id} FOR UPDATE`;
          else
            await tx.$queryRaw`SELECT id FROM "Transaction" WHERE id=${recordId} AND "userId"=${user.id} FOR UPDATE`;
          if (credit) {
            const t = await tx.transfer.findFirst({
              where: { id: recordId, userId: user.id },
              include: { from: true, to: true },
            });
            if (
              !t ||
              t.amount !== o.amount ||
              t.to.type !== "CREDIT_CARD" ||
              t.from.type === "CREDIT_CARD" ||
              (o.accountId && t.toId !== o.accountId)
            )
              throw new Error(
                "Please choose a full matching repayment to the correct card.",
              );
            transferId = t.id;
            paymentDate = t.date;
          } else {
            const t = await tx.transaction.findFirst({
              where: {
                id: recordId,
                userId: user.id,
                type: "EXPENSE",
                OR: [
                  { accountingEffect: null },
                  { accountingEffect: "EXPENSE" },
                ],
              },
            });
            if (
              !t ||
              t.amount !== o.amount ||
              (o.accountId && t.accountId !== o.accountId)
            )
              throw new Error(
                "Please choose a full matching expense in the relevant account.",
              );
            transactionId = t.id;
            paymentDate = t.date;
          }
        } else {
          const date = scheduleDate.safeParse(form.get("date"));
          if (!date.success || date.data > indiaToday())
            throw new Error(
              "Please choose a payment date no later than today.",
            );
          const accountId = String(form.get("accountId") || "");
          await ownership(tx, user.id, accountId);
          paymentDate = new Date(date.data);
          if (credit) {
            const toId = o.accountId || String(form.get("toId") || "");
            const target = await tx.financialAccount.findFirst({
              where: { id: toId, userId: user.id, type: "CREDIT_CARD" },
            });
            const source = await tx.financialAccount.findFirst({
              where: {
                id: accountId,
                userId: user.id,
                type: { not: "CREDIT_CARD" },
              },
            });
            if (!target || !source)
              throw new Error(
                "Please choose your paying account and your credit card.",
              );
            if (
              await tx.transfer.findFirst({
                where: {
                  userId: user.id,
                  fromId: accountId,
                  toId,
                  amount: o.amount,
                  date: paymentDate,
                },
              })
            )
              throw new Error(
                "Please link the matching existing repayment instead of recording it again.",
              );
            const d = transferSchema.parse({
              fromId: accountId,
              toId,
              amount: (o.amount / 100).toFixed(2),
              date: date.data,
              description: o.title,
            });
            const t = await tx.transfer.create({
              data: { ...d, date: paymentDate, userId: user.id },
            });
            transferId = t.id;
          } else {
            if (o.accountId && o.accountId !== accountId)
              throw new Error("Please use the bill's account.");
            const categoryId = String(form.get("categoryId") || "");
            await ownership(tx, user.id, accountId, categoryId);
            if (
              await tx.transaction.findFirst({
                where: {
                  userId: user.id,
                  accountId,
                  type: "EXPENSE",
                  amount: o.amount,
                  date: paymentDate,
                  description: o.title,
                },
              })
            )
              throw new Error(
                "Please link the matching existing expense instead of recording it again.",
              );
            const d = transactionSchema.parse({
              accountId,
              categoryId,
              type: "EXPENSE",
              amount: (o.amount / 100).toFixed(2),
              date: date.data,
              description: o.title,
            });
            const t = await tx.transaction.create({
              data: { ...d, date: paymentDate, userId: user.id },
            });
            transactionId = t.id;
          }
        }
        if (paymentDate! > new Date(indiaToday()))
          throw new Error("Please link a payment dated no later than today.");
        if (
          await tx.billPayment.findFirst({
            where: {
              OR: [
                ...(transactionId ? [{ transactionId }] : []),
                ...(transferId ? [{ transferId }] : []),
              ],
            },
          })
        )
          throw new Error(
            "Please choose a payment not already linked to another bill.",
          );
        await tx.billPayment.create({
          data: {
            userId: user.id,
            occurrenceId: id,
            transactionId,
            transferId,
            recordId: transactionId || transferId!,
            amount: o.amount,
            paymentDate: paymentDate!,
            note:
              mode === "link"
                ? "Linked existing payment"
                : "Recorded new full payment",
          },
        });
      },
      { timeout: 30000 },
    );
    refresh();
    return { success: true };
  } catch (e) {
    return fail(e);
  }
}
