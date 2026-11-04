"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  kinds,
  effectFor,
  kindMatchesDirection,
  merchantIdentity,
  type Recognition,
} from "@/lib/recognition";
import { Prisma } from "@/generated/prisma/client";
import type { Result } from "./actions";
const schema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(kinds),
  categoryId: z.string().max(100),
  merchant: z.string().trim().max(160),
  subcategory: z.string().trim().max(80),
  otherId: z.string().max(100).optional(),
  remember: z.string().optional(),
});
export async function correctClassification(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await getDb().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const record = await tx.transaction.findFirst({
          where: { id: d.id, userId: user.id },
          include: { reversal: true, billPayments: true, sliceEntries: true },
        });
        if (!record) throw new Error("Transaction not found.");
        if (!kindMatchesDirection(d.kind, record.type))
          throw new Error(
            "The financial purpose must agree with the original debit/credit direction.",
          );
        if (record.reversalOfId || record.reversal)
          throw new Error(
            "This transaction is already paired with a reversal. Its accounting link must be preserved.",
          );
        if (["REFUND", "REVERSAL"].includes(d.kind))
          throw new Error(
            "Keep an unmatched refund/reversal pending. Re-upload the source statement containing its reference evidence to match it safely.",
          );
        if (record.billPayments.some((p) => p.valid))
          throw new Error(
            "This transaction pays a bill. Review its bill payment link before changing its financial purpose.",
          );
        if (
          ["OWN_TRANSFER", "CARD_REPAYMENT", "CASH_WITHDRAWAL"].includes(
            d.kind,
          ) &&
          d.otherId
        ) {
          const other = await tx.financialAccount.findFirst({
            where: { id: d.otherId, userId: user.id },
          });
          if (!other || other.id === record.accountId)
            throw new Error("Choose another account you own.");
          if (
            d.kind === "CARD_REPAYMENT" &&
            (other.type !== "CREDIT_CARD" || record.type !== "EXPENSE")
          )
            throw new Error(
              "A card repayment must leave this account and enter your credit-card account.",
            );
          if (
            d.kind === "CASH_WITHDRAWAL" &&
            (other.type !== "CASH" || record.type !== "EXPENSE")
          )
            throw new Error(
              "A cash withdrawal must leave this account and enter your cash account.",
            );
          const fromId =
              record.type === "EXPENSE" ? record.accountId : other.id,
            toId = record.type === "EXPENSE" ? other.id : record.accountId;
          const existing = await tx.transfer.findFirst({
            where: {
              userId: user.id,
              fromId,
              toId,
              amount: record.amount,
              date: record.date,
              ...(record.reference
                ? { reference: record.reference }
                : { description: record.description }),
            },
          });
          if (existing)
            throw new Error(
              "A matching transfer already exists. Reconcile it explicitly rather than converting this record into a second movement.",
            );
          const transfer = await tx.transfer.create({
            data: {
              userId: user.id,
              fromId,
              toId,
              amount: record.amount,
              date: record.date,
              description: record.description,
              reference: record.reference,
              sourceOrder: record.sourceOrder,
            },
          });
          for (const entry of record.sliceEntries)
            await tx.sliceEntry.update({
              where: { id: entry.id },
              data: {
                transactionId: null,
                transferId: transfer.id,
                source: entry.source ?? {
                  description: record.description,
                  reference: record.reference,
                  date: record.date.toISOString().slice(0, 10),
                  debit: record.type === "EXPENSE" ? record.amount : 0,
                  credit: record.type === "INCOME" ? record.amount : 0,
                  balance: entry.balance,
                  kind: d.kind,
                },
              },
            });
          await tx.transaction.delete({ where: { id: record.id } });
          return;
        }
        if (["OWN_TRANSFER", "CARD_REPAYMENT"].includes(d.kind))
          throw new Error(
            "Choose the other owned account to record a linked movement.",
          );
        const category = d.categoryId
          ? await tx.category.findFirst({
              where: { id: d.categoryId, userId: user.id, type: record.type },
            })
          : null;
        if (d.categoryId && !category)
          throw new Error(
            "Choose your own category matching the cash direction.",
          );
        const entity = merchantIdentity(record.description);
        const effect = effectFor(d.kind, record.type);
        const recognised: Recognition = {
          merchant: d.merchant,
          identity: entity.normalised ? "merchant:" + entity.normalised : "",
          upi: entity.upi,
          kind: d.kind,
          category: category?.name ?? "",
          subcategory: d.subcategory,
          effect,
          confidence: "USER",
          review: d.kind === "UNKNOWN",
          evidence: ["Explicitly confirmed by the account owner"],
          categoryId: category?.id ?? record.categoryId,
        };
        await tx.transaction.update({
          where: { id: record.id },
          data: {
            classification: recognised as unknown as Prisma.InputJsonValue,
            accountingEffect: effect,
            ...(category ? { categoryId: category.id } : {}),
          },
        });
        if (d.remember === "on") {
          if (!recognised.identity || recognised.review)
            throw new Error(
              "Confirm a merchant and financial purpose before saving a future rule.",
            );
          for (const identity of [
            recognised.identity,
            ...entity.upi.map((u) => "upi:" + u),
          ])
            await tx.merchantClassification.upsert({
              where: {
                userId_identity_direction: {
                  userId: user.id,
                  identity,
                  direction: record.type,
                },
              },
              create: {
                userId: user.id,
                identity,
                direction: record.type,
                merchant: d.merchant,
                kind: d.kind,
                categoryId: recognised.categoryId!,
                subcategory: d.subcategory,
                effect,
              },
              update: {
                merchant: d.merchant,
                kind: d.kind,
                categoryId: recognised.categoryId!,
                subcategory: d.subcategory,
                effect,
              },
            });
        }
      },
      { timeout: 30000 },
    );
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (e) {
    return {
      error:
        e instanceof Error && !e.name.startsWith("Prisma")
          ? e.message
          : "Could not save the classification. No changes were committed.",
    };
  }
}
