import { z } from "zod";
import { money, dateOnly } from "./validation";
export const recordId = z.string().min(1).max(100);
export const monthSchema = z
  .string()
  .regex(/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/, "Choose a valid month.")
  .refine((m) => m <= "9998-12", "Choose a month before 9999.");
export const budgetSchema = z.object({
  month: monthSchema,
  categoryId: z.string().max(100),
  amount: money,
});
export const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  target: money,
  deadline: z.union([z.literal(""), dateOnly]),
});
export const contributionSchema = z.object({ goalId: recordId, amount: money });
