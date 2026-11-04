"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { classificationPlan } from "@/lib/classification-plan";
import { Prisma } from "@/generated/prisma/client";
import type { Result } from "./actions";
export async function applyClassificationPlan(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const digest = form.get("digest");
  if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
    return { error: "Invalid review plan." };
  try {
    await getDb().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const plan = await classificationPlan(tx, user.id);
        if (plan.digest !== digest)
          throw new Error(
            "Records or rules changed. Reload and review the updated plan.",
          );
        for (const row of plan.rows) {
          const r = row.recognition;
          let categoryId = row.categoryId;
          if (r.categoryId) {
            const category = await tx.category.findFirst({
              where: { id: r.categoryId, userId: user.id, type: row.direction },
            });
            if (!category)
              throw new Error(
                "A remembered category is no longer available. Review the rule.",
              );
            categoryId = category.id;
          } else if (r.category && !r.review) {
            const category = await tx.category.upsert({
              where: {
                userId_name_type: {
                  userId: user.id,
                  name: r.category,
                  type: row.direction,
                },
              },
              create: {
                userId: user.id,
                name: r.category,
                type: row.direction,
              },
              update: {},
            });
            categoryId = category.id;
          }
          await tx.transaction.update({
            where: { id: row.id },
            data: {
              categoryId,
              accountingEffect: r.effect,
              classification: {
                ...r,
                categoryId,
                evidence: [
                  ...r.evidence,
                  "Owner approved classification review plan",
                ],
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      },
      {
        timeout: 120000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (e) {
    return {
      error:
        e instanceof Error && !e.name.startsWith("Prisma")
          ? e.message
          : "The plan could not be applied. Nothing was changed.",
    };
  }
}
