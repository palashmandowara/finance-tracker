"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { readStatement } from "@/lib/statement-files";
import {
  mappingSchema,
  parseStatementRow,
  suggest,
  reviewSchema,
  normalize,
  duplicate,
  transferSchema,
  MAX_ROWS,
  type Mapping,
  type ReviewRow,
} from "@/lib/statements";
import { Prisma } from "@/generated/prisma/client";
import type { Result } from "./actions";
type Stored = {
  headers: string[];
  rows: string[][];
  accountId?: string;
  preview?: ReviewRow[];
};
type Report = {
  imported: number;
  skipped: number;
  invalid: number;
  reconciled: number;
  messages: string[];
};
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function uploadStatement(form: FormData) {
  await requireUser();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose a statement file." };
  try {
    const data = await readStatement(file);
    const user = await requireUser();
    const batch = await getDb().importBatch.create({
      data: { userId: user.id, data: json(data) },
    });
    return { id: batch.id, ...data };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not read statement.",
    };
  }
}
async function candidates(userId: string, accountId: string) {
  const db = getDb();
  const [transactions, transfers] = await Promise.all([
    db.transaction.findMany({
      where: { userId, accountId },
      include: { account: true },
    }),
    db.transfer.findMany({
      where: { userId, OR: [{ fromId: accountId }, { toId: accountId }] },
      include: { from: true, to: true },
    }),
  ]);
  return [
    ...transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      amount: t.amount,
      type: t.type,
      description: t.description,
      reference: t.reference,
      label:
        t.date.toISOString().slice(0, 10) +
        " · " +
        t.account.name +
        " · " +
        t.description +
        " · ₹" +
        (t.amount / 100).toFixed(2),
      transfer: false,
      otherId: "",
    })),
    ...transfers.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      amount: t.amount,
      type: t.fromId === accountId ? "EXPENSE" : "INCOME",
      description: t.description,
      reference: t.reference,
      label:
        t.date.toISOString().slice(0, 10) +
        " · " +
        t.from.name +
        " → " +
        t.to.name +
        " · ₹" +
        (t.amount / 100).toFixed(2),
      transfer: true,
      otherId: t.fromId === accountId ? t.toId : t.fromId,
    })),
  ];
}
export async function previewStatement(
  id: string,
  accountId: string,
  mapping: Mapping,
) {
  const user = await requireUser();
  if (
    typeof id !== "string" ||
    id.length > 100 ||
    typeof accountId !== "string" ||
    accountId.length > 100
  )
    return { error: "Invalid import or account." };
  const parsed = mappingSchema.safeParse(mapping);
  if (!parsed.success)
    return { error: "Confirm every mapping and date/amount convention." };
  const db = getDb();
  const batch = await db.importBatch.findFirst({
    where: { id, userId: user.id },
  });
  if (!batch || batch.result)
    return { error: "Import not found or already confirmed." };
  if (
    !(await db.financialAccount.findFirst({
      where: { id: accountId, userId: user.id },
    }))
  )
    return { error: "Choose your own destination account." };
  const stored = batch.data as unknown as Stored;
  const [categories, rules, existing] = await Promise.all([
    db.category.findMany({ where: { userId: user.id } }),
    db.merchantRule.findMany({ where: { userId: user.id } }),
    candidates(user.id, accountId),
  ]);
  const rows = stored.rows.map((cells, index) =>
    parseStatementRow(cells, index, parsed.data),
  );
  const earlier: typeof existing = [];
  for (const row of rows) {
    if (row.blocked) continue;
    row.categoryId = suggest(row.description, row.type, categories, rules);
    const amount = reviewSchema.safeParse({
      ...row,
      categoryId: row.categoryId,
    });
    if (!amount.success) continue;
    const matches = [...existing, ...earlier].filter(
      (t) =>
        duplicate({ ...row, amount: amount.data.amount }, t) ||
        (t.transfer &&
          t.amount === amount.data.amount &&
          t.type === row.type &&
          t.date === row.date),
    );
    row.matches = matches.slice(0, 5).map((t) => t.label);
    if (matches.length) row.decision = "SKIP";
    const transfer = matches.find((t) => t.transfer);
    if (transfer) {
      row.kind = "TRANSFER";
      row.otherId = transfer.otherId;
    }
    earlier.push({
      id: "row-" + row.index,
      date: row.date,
      amount: amount.data.amount,
      type: row.type,
      description: row.description,
      reference: row.reference,
      label: "Upload row " + (row.index + 2) + " · " + row.description,
      transfer: row.kind === "TRANSFER",
      otherId: row.otherId,
    });
  }
  await db.importBatch.updateMany({
    where: { id, userId: user.id, result: { equals: Prisma.DbNull } },
    data: { data: json({ ...stored, accountId, preview: rows }) },
  });
  return { rows };
}
export async function confirmStatement(
  id: string,
  rows: ReviewRow[],
): Promise<{ error?: string; report?: Report }> {
  const user = await requireUser();
  if (
    typeof id !== "string" ||
    id.length > 100 ||
    !Array.isArray(rows) ||
    rows.length > MAX_ROWS
  )
    return { error: "Too many rows." };
  const db = getDb();
  try {
    const report = await db.$transaction(
      async (tx) => {
        // Serialize imports per user, and lock the batch for durable exactly-once confirmation.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const batch = await tx.importBatch.findFirst({
          where: { id, userId: user.id },
        });
        if (!batch) throw new Error("Import not found.");
        if (batch.result) return batch.result as unknown as Report;
        const stored = batch.data as unknown as Stored;
        if (
          !stored.accountId ||
          !stored.preview ||
          rows.length !== stored.preview.length ||
          new Set(rows.map((r) => r.index)).size !== rows.length ||
          rows.some((r, i) => r.index !== i)
        )
          throw new Error("Preview changed. Map the statement again.");
        const accountId = stored.accountId;
        const accounts = await tx.financialAccount.findMany({
          where: { userId: user.id },
        });
        if (!accounts.some((a) => a.id === accountId))
          throw new Error("Account not found.");
        const categories = await tx.category.findMany({
          where: { userId: user.id },
        });
        const transactions = await tx.transaction.findMany({
          where: { userId: user.id, accountId },
        });
        const transfers = await tx.transfer.findMany({
          where: {
            userId: user.id,
            OR: [{ fromId: accountId }, { toId: accountId }],
          },
        });
        const known = [
          ...transactions.map((t) => ({
            date: t.date.toISOString().slice(0, 10),
            amount: t.amount,
            type: String(t.type),
            description: t.description,
            reference: t.reference,
            transfer: false,
            otherId: "",
          })),
          ...transfers.map((t) => ({
            date: t.date.toISOString().slice(0, 10),
            amount: t.amount,
            type: t.fromId === accountId ? "EXPENSE" : "INCOME",
            description: t.description,
            reference: t.reference,
            transfer: true,
            otherId: t.fromId === accountId ? t.toId : t.fromId,
          })),
        ];
        const result: Report = {
          imported: 0,
          skipped: 0,
          invalid: 0,
          reconciled: 0,
          messages: [],
        };
        for (const row of rows) {
          if (stored.preview[row.index].blocked || row.decision === "SKIP") {
            result.skipped++;
            continue;
          }
          const parsed = reviewSchema.safeParse(row);
          if (!parsed.success) {
            result.invalid++;
            result.messages.push(
              "Row " + (row.index + 2) + ": " + parsed.error.issues[0].message,
            );
            continue;
          }
          const d = parsed.data;
          const category = categories.find(
            (c) => c.id === d.categoryId && c.type === d.type,
          );
          if (d.kind === "TRANSACTION" && !category) {
            result.invalid++;
            result.messages.push(
              "Row " + (row.index + 2) + ": choose your own matching category.",
            );
            continue;
          }
          if (
            d.kind === "TRANSFER" &&
            (!accounts.some((a) => a.id === d.otherId) ||
              d.otherId === accountId)
          ) {
            result.invalid++;
            result.messages.push(
              "Row " +
                (row.index + 2) +
                ": choose a different account you own.",
            );
            continue;
          }
          if (
            d.remember &&
            d.kind === "TRANSACTION" &&
            (!normalize(d.keyword) ||
              !normalize(d.description).includes(normalize(d.keyword)))
          ) {
            result.invalid++;
            result.messages.push(
              "Row " +
                (row.index + 2) +
                ": merchant keyword must occur in the description.",
            );
            continue;
          }
          // Existing opposite-side transfers represent one movement, never a second expense.
          const matchedTransfer = known.find(
            (t) =>
              t.transfer &&
              t.amount === d.amount &&
              t.type === d.type &&
              (d.kind !== "TRANSFER" || t.otherId === d.otherId) &&
              ((d.reference &&
                t.reference &&
                normalize(d.reference) === normalize(t.reference)) ||
                (t.date === d.date &&
                  (normalize(t.description) === normalize(d.description) ||
                    d.kind === "TRANSFER"))),
          );
          if (matchedTransfer && d.decision !== "KEEP") {
            result.reconciled++;
            result.skipped++;
            continue;
          }
          if (known.some((t) => duplicate(d, t)) && d.decision !== "KEEP") {
            result.skipped++;
            continue;
          }
          if (d.kind === "TRANSFER") {
            await tx.transfer.create({
              data: {
                userId: user.id,
                fromId: d.type === "EXPENSE" ? accountId : d.otherId,
                toId: d.type === "EXPENSE" ? d.otherId : accountId,
                amount: d.amount,
                date: new Date(d.date),
                description: d.description,
                reference: d.reference || null,
              },
            });
          } else {
            await tx.transaction.create({
              data: {
                userId: user.id,
                accountId,
                categoryId: d.categoryId,
                amount: d.amount,
                type: d.type,
                date: new Date(d.date),
                description: d.description,
                reference: d.reference || null,
              },
            });
            if (d.remember)
              await tx.merchantRule.upsert({
                where: {
                  userId_keyword_type: {
                    userId: user.id,
                    keyword: normalize(d.keyword),
                    type: d.type,
                  },
                },
                create: {
                  userId: user.id,
                  keyword: normalize(d.keyword),
                  type: d.type,
                  categoryId: d.categoryId,
                },
                update: { categoryId: d.categoryId },
              });
          }
          known.push({
            ...d,
            transfer: d.kind === "TRANSFER",
            otherId: d.otherId,
          });
          result.imported++;
        }
        await tx.importBatch.update({
          where: { id },
          data: {
            result: json(result),
            data: json({ accountId, headers: [], rows: [] }),
          },
        });
        return result;
      },
      { timeout: 30000 },
    );
    revalidatePath("/dashboard", "layout");
    return { report };
  } catch (e) {
    return {
      error:
        e instanceof Error &&
        [
          "Import not found.",
          "Preview changed. Map the statement again.",
          "Account not found.",
        ].includes(e.message)
          ? e.message
          : "Import could not be saved. Nothing from this attempt was committed; retry safely.",
    };
  }
}
export async function saveTransfer(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = transferSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    const owned = await getDb().financialAccount.count({
      where: { userId: user.id, id: { in: [d.fromId, d.toId] } },
    });
    if (owned !== 2) return { error: "Choose two accounts you own." };
    await getDb().transfer.create({
      data: { ...d, date: new Date(d.date), userId: user.id },
    });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch {
    return { error: "Could not save transfer." };
  }
}
export async function deleteTransfer(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const id = form.get("id");
  if (typeof id !== "string") return { error: "Invalid transfer." };
  const result = await getDb().transfer.deleteMany({
    where: { id, userId: user.id },
  });
  revalidatePath("/dashboard", "layout");
  return result.count ? { success: true } : { error: "Transfer not found." };
}
