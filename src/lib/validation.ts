import { z } from "zod";

// Parse decimal strings without floating point multiplication.
export function toPaise(value: string): number {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (
    (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
    (negative ? -1 : 1)
  );
}
export const money = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter rupees with up to 2 decimal places.")
  .transform(toPaise)
  .refine(
    (n) => n > 0 && n <= 2147483647,
    "Amount must be between ₹0.01 and ₹2,14,74,836.47.",
  );
const opening = z
  .string()
  .trim()
  .regex(/^-?\d{1,8}(\.\d{1,2})?$/, "Enter a valid opening balance.")
  .transform(toPaise)
  .refine((n) => Math.abs(n) <= 2147483647, "Opening balance is too large.");
export const transactionType = z.enum(["INCOME", "EXPENSE"]);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine(
    (s) =>
      s >= "1900-01-01" &&
      s <= "9999-12-31" &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Choose a valid date.",
  );
export const accountSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(["BANK", "CASH", "WALLET", "CREDIT_CARD"]),
  openingBalance: opening,
});
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: transactionType,
});
export const transactionSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: money,
  type: transactionType,
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  date: dateOnly,
});
export const filtersSchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    category: z.string().max(100).optional(),
    account: z.string().max(100).optional(),
    type: transactionType.optional(),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Start date must be before end date.",
  );
export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});
export const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(80),
});

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Use at most 80 characters."),
});
