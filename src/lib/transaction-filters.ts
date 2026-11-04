import type { Prisma } from "@/generated/prisma/client";
import { filtersSchema } from "./validation";
export function transactionWhere(
  userId: string,
  filters: ReturnType<typeof filtersSchema.parse>,
): Prisma.TransactionWhereInput {
  return {
    userId,
    ...(filters.account && { accountId: filters.account }),
    ...(filters.category && { categoryId: filters.category }),
    ...(filters.type && { type: filters.type }),
    ...((filters.from || filters.to) && {
      date: {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      },
    }),
  };
}
