"use server";
import { z } from "zod";
import { kinds } from "@/lib/recognition";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Prisma } from "@/generated/prisma/client";
import {
  prepareSlice,
  commitSlice,
  type SliceChoice,
  type SlicePreview,
} from "@/lib/slice-service";
import { SLICE_MAX_ROWS, type SliceStatement } from "@/lib/slice";
const idSchema = z.string().min(1).max(100);
export async function previewSlice(
  id: string,
  accountId: string,
): Promise<{ preview?: SlicePreview; error?: string }> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(accountId).success)
    return { error: "Invalid import or account." };
  try {
    return await getDb().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const batch = await tx.importBatch.findFirst({
          where: { id, userId: user.id },
        });
        if (!batch || batch.result)
          throw new Error("Import not found or already confirmed.");
        const data = batch.data as unknown as { slice?: SliceStatement };
        if (!data.slice) throw new Error("Not a Slice statement.");
        const preview = await prepareSlice(tx, user.id, accountId, data.slice);
        await tx.importBatch.update({
          where: { id },
          data: {
            data: JSON.parse(
              JSON.stringify({ ...data, accountId }),
            ) as Prisma.InputJsonValue,
          },
        });
        return { preview };
      },
      { timeout: 30000 },
    );
  } catch (e) {
    return {
      error:
        e instanceof Error &&
        /^(Choose an account|Choose the bank|Import not found|Not a Slice statement)/.test(
          e.message,
        )
          ? e.message
          : "Could not analyse the statement. Please retry.",
    };
  }
}
const choiceSchema = z
  .array(
    z.object({
      order: z
        .number()
        .int()
        .min(1)
        .max(SLICE_MAX_ROWS + 200),
      action: z.enum(["IMPORT", "SKIP", "TRANSACTION", "TRANSFER", "DEFER"]),
      categoryId: z.string().max(100).optional(),
      otherId: z.string().max(100).optional(),
      kind: z.enum(kinds).optional(),
      remember: z.boolean().optional(),
    }),
  )
  .max(SLICE_MAX_ROWS);
export async function confirmSlice(
  id: string,
  choices: SliceChoice[],
  useOpening: boolean,
) {
  const user = await requireUser();
  const parsed = choiceSchema.safeParse(choices);
  if (
    !idSchema.safeParse(id).success ||
    !parsed.success ||
    typeof useOpening !== "boolean"
  )
    return { error: "Invalid import choices." };
  try {
    const report = await getDb().$transaction(
      (tx) => commitSlice(tx, user.id, id, parsed.data, useOpening),
      {
        timeout: 120000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
    revalidatePath("/dashboard", "layout");
    return { report };
  } catch (e) {
    // Never return Prisma/driver diagnostics containing raw private data.
    return {
      error:
        e instanceof Prisma.PrismaClientKnownRequestError ||
        e instanceof Prisma.PrismaClientUnknownRequestError
          ? "The account changed during import or a database check failed. Nothing was committed. Analyse again and retry safely."
          : e instanceof Error
            ? e.message
            : "Import failed. Nothing was committed.",
    };
  }
}
