import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { recognise } from "./recognition";
export async function classificationPlan(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const [records, learned, rules] = await Promise.all([
    tx.transaction.findMany({
      where: {
        userId,
        classification: { equals: Prisma.DbNull },
        sliceEntries: { some: {} },
        reversalOfId: null,
        reversal: null,
      },
      include: { category: true },
      orderBy: { id: "asc" },
      take: 5000,
    }),
    tx.merchantClassification.findMany({ where: { userId } }),
    tx.merchantRule.findMany({ where: { userId } }),
  ]);
  const rows = records.map((t) => ({
    id: t.id,
    description: t.description,
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount,
    direction: t.type,
    category: t.category.name,
    categoryId: t.categoryId,
    updatedAt: t.updatedAt.toISOString(),
    recognition: recognise(t.description, t.type, "", learned, rules),
  }));
  return {
    rows,
    digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  };
}
