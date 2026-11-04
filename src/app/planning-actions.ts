"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import {
  budgetSchema,
  goalSchema,
  contributionSchema,
  recordId,
} from "@/lib/planning-validation";
import type { Result } from "./actions";
const failed = { error: "Could not save your changes. Please try again." };
function done(): Result {
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function saveBudget(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = budgetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = form.get("id");
  if (id !== null && !recordId.safeParse(id).success)
    return { error: "Invalid budget." };
  const { month, categoryId, amount } = parsed.data;
  try {
    const db = getDb();
    if (
      categoryId &&
      !(await db.category.findFirst({
        where: { id: categoryId, userId: user.id, type: "EXPENSE" },
      }))
    )
      return { error: "Choose your own expense category." };
    const data = {
      month,
      categoryId: categoryId || null,
      scope: categoryId || "overall",
      amount,
    };
    if (id) {
      const updated = await db.budget.updateMany({
        where: { id: String(id), userId: user.id },
        data,
      });
      if (!updated.count) return { error: "Budget not found." };
    } else
      await db.budget.upsert({
        where: {
          userId_month_scope: { userId: user.id, month, scope: data.scope },
        },
        create: { ...data, userId: user.id },
        update: { amount },
      });
    return done();
  } catch {
    return failed;
  }
}
export async function saveGoal(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = goalSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = form.get("id");
  if (id !== null && !recordId.safeParse(id).success)
    return { error: "Invalid goal." };
  const data = {
    ...parsed.data,
    deadline: parsed.data.deadline
      ? new Date(`${parsed.data.deadline}T00:00:00Z`)
      : null,
  };
  try {
    if (id) {
      const updated = await getDb().savingsGoal.updateMany({
        where: { id: String(id), userId: user.id },
        data,
      });
      if (!updated.count) return { error: "Goal not found." };
    } else
      await getDb().savingsGoal.create({ data: { ...data, userId: user.id } });
    return done();
  } catch {
    return failed;
  }
}
export async function deleteGoal(_: Result, form: FormData): Promise<Result> {
  const user = await requireUser();
  const id = recordId.safeParse(form.get("id"));
  if (!id.success) return { error: "Invalid goal." };
  try {
    const result = await getDb().savingsGoal.deleteMany({
      where: { id: id.data, userId: user.id },
    });
    return result.count ? done() : { error: "Goal not found." };
  } catch {
    return failed;
  }
}
export async function addContribution(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const parsed = contributionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    if (
      !(await getDb().savingsGoal.findFirst({
        where: { id: parsed.data.goalId, userId: user.id },
      }))
    )
      return { error: "Goal not found." };
    await getDb().goalContribution.create({
      data: { ...parsed.data, userId: user.id },
    });
    return done();
  } catch {
    return failed;
  }
}
export async function removeContribution(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const id = recordId.safeParse(form.get("id"));
  if (!id.success) return { error: "Invalid allocation." };
  try {
    const result = await getDb().goalContribution.deleteMany({
      where: { id: id.data, userId: user.id },
    });
    return result.count ? done() : { error: "Allocation not found." };
  } catch {
    return failed;
  }
}
