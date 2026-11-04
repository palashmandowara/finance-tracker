"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  accountSchema,
  categorySchema,
  transactionSchema,
} from "@/lib/validation";
export type Result = { error?: string; success?: boolean };
function failure(error: unknown): Result {
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "P2002"
  )
    return { error: "That name already exists. Choose another name." };
  return { error: "Could not save your changes. Please try again." };
}
function refresh() {
  revalidatePath("/dashboard", "layout");
}
export async function saveAccount(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await getDb().financialAccount.create({
      data: { ...parsed.data, userId: user.id },
    });
    refresh();
    return { success: true };
  } catch (e) {
    return failure(e);
  }
}
export async function saveCategory(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await getDb().category.create({
      data: { ...parsed.data, userId: user.id },
    });
    refresh();
    return { success: true };
  } catch (e) {
    return failure(e);
  }
}
export async function saveTransaction(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const parsed = transactionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = form.get("id");
  if (id !== null && (typeof id !== "string" || id.length > 100))
    return { error: "Invalid transaction." };
  const db = getDb();
  try {
    const data = parsed.data;
    const [account, category] = await Promise.all([
      db.financialAccount.findFirst({
        where: { id: data.accountId, userId: user.id },
      }),
      db.category.findFirst({
        where: { id: data.categoryId, userId: user.id, type: data.type },
      }),
    ]);
    if (!account || !category)
      return {
        error:
          "Choose your own account and a category matching the transaction type.",
      };
    const record = { ...data, date: new Date(`${data.date}T00:00:00.000Z`) };
    if (id) {
      const linked = await db.transaction.findFirst({
        where: { id, userId: user.id },
        include: { reversal: true },
      });
      if (
        linked &&
        (linked.reversalOfId || linked.reversal) &&
        (linked.amount !== record.amount ||
          linked.type !== record.type ||
          linked.accountId !== record.accountId ||
          linked.date.getTime() !== record.date.getTime())
      )
        return {
          error:
            "This transaction is linked to a reversal. Remove the reversal first before changing its amount, account, direction or date.",
        };
      const result = await db.transaction.updateMany({
        where: { id, userId: user.id },
        data: {
          ...record,
          ...(linked?.classification &&
          !linked.reversalOfId &&
          !linked.reversal &&
          (linked.type !== record.type ||
            linked.description !== record.description)
            ? {
                accountingEffect: "NEUTRAL",
                classification: {
                  ...(linked.classification as Record<string, string>),
                  kind: "UNKNOWN",
                  effect: "NEUTRAL",
                  review: true,
                  evidence: [
                    "Description or direction edited; review classification",
                  ],
                },
              }
            : {}),
        },
      });
      if (!result.count) return { error: "Transaction not found." };
    } else
      await db.transaction.create({ data: { ...record, userId: user.id } });
    refresh();
    return { success: true };
  } catch (e) {
    return failure(e);
  }
}
export async function deleteTransaction(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const id = form.get("id");
  if (typeof id !== "string" || !id || id.length > 100)
    return { error: "Invalid transaction." };
  try {
    const paired = await getDb().transaction.findFirst({
      where: { id, userId: user.id },
      select: { reversal: { select: { id: true } } },
    });
    if (paired?.reversal)
      return {
        error:
          "Delete the linked reversal first before deleting the original payment.",
      };
    const result = await getDb().transaction.deleteMany({
      where: { id, userId: user.id },
    });
    if (!result.count) return { error: "Transaction not found." };
    refresh();
    return { success: true };
  } catch (e) {
    return failure(e);
  }
}
