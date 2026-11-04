import { z } from "zod";
import { dateOnly, money, toPaise } from "./validation";
export const MAX_ROWS = 500,
  MAX_BYTES = 2 * 1024 * 1024;
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
export function csvCell(value: string) {
  const safe =
    /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value)
      ? "'" + value
      : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csv(rows: string[][]) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export const mappingSchema = z.object({
  date: z.coerce.number().int().min(0).max(39),
  description: z.coerce.number().int().min(0).max(39),
  debit: z.coerce.number().int().min(-1).max(39),
  credit: z.coerce.number().int().min(-1).max(39),
  amount: z.coerce.number().int().min(-1).max(39),
  type: z.coerce.number().int().min(-1).max(39),
  reference: z.coerce.number().int().min(-1).max(39),
  mode: z.enum(["split", "signed"]),
  dateFormat: z.enum(["DMY", "MDY", "YMD"]),
  positive: z.enum(["INCOME", "EXPENSE"]),
});
export type Mapping = z.infer<typeof mappingSchema>;
export type ReviewRow = {
  index: number;
  date: string;
  description: string;
  amount: string;
  type: "INCOME" | "EXPENSE";
  reference: string;
  categoryId: string;
  kind: "TRANSACTION" | "TRANSFER";
  otherId: string;
  decision: "IMPORT" | "SKIP" | "KEEP";
  remember: boolean;
  keyword: string;
  error: string;
  blocked: boolean;
  matches: string[];
};
export const reviewSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(MAX_ROWS - 1),
  date: dateOnly,
  description: z.string().trim().min(1).max(160),
  amount: money,
  type: z.enum(["INCOME", "EXPENSE"]),
  reference: z.string().trim().max(120),
  categoryId: z.string().max(100),
  kind: z.enum(["TRANSACTION", "TRANSFER"]),
  otherId: z.string().max(100),
  decision: z.enum(["IMPORT", "SKIP", "KEEP"]),
  remember: z.boolean(),
  keyword: z.string().trim().max(80),
});
export function parseDate(value: string, format: Mapping["dateFormat"]) {
  const pieces = value.trim().split(/[-/.]/);
  if (pieces.length !== 3) return "";
  const [a, b, c] = pieces;
  const [y, m, d] =
    format === "YMD" ? [a, b, c] : format === "DMY" ? [c, b, a] : [c, a, b];
  if (y.length !== 4) return "";
  const result = [y, m.padStart(2, "0"), d.padStart(2, "0")].join("-");
  return dateOnly.safeParse(result).success ? result : "";
}
export function statementAmount(value: string) {
  const clean = value.trim().replace(/[₹,\s]/g, "");
  if (!/^[+-]?\d{1,8}(\.\d{1,2})?$/.test(clean))
    throw new Error("Invalid amount");
  const n = toPaise(clean.replace(/^\+/, ""));
  if (!Number.isSafeInteger(n) || Math.abs(n) > 2147483647)
    throw new Error("Amount is too large");
  return n;
}
export function parseStatementRow(
  cells: string[],
  index: number,
  m: Mapping,
): ReviewRow {
  const get = (i: number) => (i < 0 ? "" : (cells[i]?.trim() ?? ""));
  const description = get(m.description);
  const date = get(m.date);
  const blocked =
    /^(opening balance|closing balance|balance brought forward|balance carried forward|total(?:s)?(?: debit| credit| amount)?|statement(?: summary)?|date)$/i.test(
      description,
    ) ||
    /^(opening balance|closing balance|total(?:s)?|date)$/i.test(date) ||
    cells.every((c) => !c.trim());
  let type: "INCOME" | "EXPENSE" = "EXPENSE",
    amount = "",
    error = "";
  try {
    let n: number;
    if (m.mode === "split") {
      if (m.debit < 0 || m.credit < 0)
        throw new Error("Map both debit and credit columns");
      const debit = get(m.debit) ? statementAmount(get(m.debit)) : 0,
        credit = get(m.credit) ? statementAmount(get(m.credit)) : 0;
      if (debit < 0 || credit < 0 || Boolean(debit) === Boolean(credit))
        throw new Error("Use one positive debit or credit");
      n = debit || credit;
      type = debit ? "EXPENSE" : "INCOME";
    } else {
      if (m.amount < 0) throw new Error("Map the amount column");
      n = statementAmount(get(m.amount));
      if (!n) throw new Error("Amount must not be zero");
      type =
        n > 0 ? m.positive : m.positive === "INCOME" ? "EXPENSE" : "INCOME";
      n = Math.abs(n);
    }
    if (m.type >= 0 && get(m.type)) {
      const raw = get(m.type).toUpperCase();
      const mapped = ["INCOME", "CREDIT", "CR"].includes(raw)
        ? "INCOME"
        : ["EXPENSE", "DEBIT", "DR"].includes(raw)
          ? "EXPENSE"
          : null;
      if (!mapped || mapped !== type)
        throw new Error("Type conflicts with the confirmed amount convention");
    }
    amount = (n / 100).toFixed(2);
  } catch (e) {
    error = (e as Error).message;
  }
  const parsedDate = parseDate(date, m.dateFormat);
  if (!parsedDate) error = error || "Invalid date for selected format";
  if (!description || description.length > 160)
    error = error || "Description must be 1–160 characters";
  return {
    index,
    date: parsedDate || date,
    description,
    amount,
    type,
    reference: get(m.reference),
    categoryId: "",
    kind: /\b(transfer|repayment|card payment|credit card bill|self transfer)\b/i.test(
      description,
    )
      ? "TRANSFER"
      : "TRANSACTION",
    otherId: "",
    decision: blocked ? "SKIP" : "IMPORT",
    remember: false,
    keyword: "",
    error: blocked ? "Statement heading / total / balance — excluded" : error,
    blocked,
    matches: [],
  };
}
export type CategoryOption = { id: string; name: string; type: string };
export function suggest(
  description: string,
  type: string,
  categories: CategoryOption[],
  rules: { keyword: string; categoryId: string; type: string }[],
) {
  const text = " " + normalize(description) + " ";
  const own = rules
    .filter((r) => r.type === type && text.includes(" " + r.keyword + " "))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  if (own.length) return own[0].categoryId;
  const defaults = [
    {
      words: ["grocery", "groceries", "supermarket"],
      names: ["food", "groceries", "food drinks"],
    },
    { words: ["salary", "payroll"], names: ["salary", "income"] },
    { words: ["uber", "ola", "metro"], names: ["transport", "travel"] },
  ];
  const hits = new Set<string>();
  for (const rule of defaults)
    if (rule.words.some((w) => text.includes(" " + w + " ")))
      for (const c of categories)
        if (c.type === type && rule.names.includes(normalize(c.name)))
          hits.add(c.id);
  return hits.size === 1 ? [...hits][0] : "";
}
export function duplicate(
  a: {
    date: string;
    amount: number;
    type: string;
    description: string;
    reference?: string | null;
  },
  b: typeof a,
) {
  return (
    a.type === b.type &&
    a.amount === b.amount &&
    ((!!a.reference &&
      !!b.reference &&
      normalize(a.reference) === normalize(b.reference)) ||
      (a.date === b.date &&
        normalize(a.description) === normalize(b.description)))
  );
}
export const transferSchema = z
  .object({
    fromId: z.string().min(1).max(100),
    toId: z.string().min(1).max(100),
    amount: money,
    date: dateOnly,
    description: z.string().trim().min(1).max(160),
    reference: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.fromId !== v.toId, "Choose two different accounts.");
