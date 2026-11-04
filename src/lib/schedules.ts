import { z } from "zod";
import { dateOnly, money } from "./validation";
import { normalize } from "./statements";
export const scheduleDate = dateOnly.refine(
  (s) => s >= "2000-01-01" && s <= "2100-12-31",
  "Use a date from 2000 through 2100.",
);
const optionalId = z
  .string()
  .max(100)
  .optional()
  .transform((v) => v || null);
export const subscriptionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amount: money,
  frequency: z.enum(["MONTHLY", "YEARLY"]),
  nextRenewal: scheduleDate,
  accountId: optionalId,
  categoryId: optionalId,
});
export const billSchema = z.object({
  title: z.string().trim().min(1).max(80),
  amount: money,
  kind: z.enum(["CREDIT_CARD", "RENT", "EMI", "UTILITY", "OTHER"]),
  accountId: optionalId,
  recurrence: z.enum(["ONCE", "MONTHLY", "YEARLY"]),
  startDate: scheduleDate,
});
export const merchantKey = (s: string) =>
  normalize(s)
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function recurrenceDate(
  anchor: string,
  frequency: string,
  index: number,
) {
  if (frequency === "ONCE") return anchor;
  const [y, m, d] = anchor.split("-").map(Number);
  const offset = frequency === "YEARLY" ? index * 12 : index;
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}
export function scheduleDates(
  anchor: string,
  frequency: string,
  from: string,
  to: string,
) {
  const dates: string[] = [];
  for (let i = 0; i < 1213; i++) {
    const date = recurrenceDate(anchor, frequency, i);
    if (date > to) break;
    if (date >= from) dates.push(date);
    if (frequency === "ONCE") break;
  }
  return dates;
}
export function estimatedCosts(amount: number, frequency: string) {
  const annual = frequency === "YEARLY" ? amount : amount * 12;
  return { annual, monthly: Math.round(annual / 12) };
}
export function eventStatus(date: string, paid: boolean, today: string) {
  return paid
    ? "Paid"
    : date < today
      ? "Overdue"
      : date === today
        ? "Due today"
        : "Upcoming";
}
export type Evidence = {
  id: string;
  description: string;
  amount: number;
  date: string;
  accountId: string;
  categoryId: string;
};
export function detectSubscriptions(records: Evidence[], excluded: string[]) {
  const groups = new Map<string, Evidence[]>();
  for (const record of records) {
    const key = merchantKey(record.description);
    if (!key || excluded.includes(key)) continue;
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  const suggestions: {
    merchant: string;
    name: string;
    amount: number;
    frequency: "MONTHLY" | "YEARLY";
    nextRenewal: string;
    accountId: string;
    categoryId: string;
    evidence: Evidence[];
  }[] = [];
  for (const [merchant, all] of groups) {
    const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted.at(-1)!;
    const rows = sorted.filter(
      (r) =>
        Math.abs(r.amount - latest.amount) * 100 <=
        Math.max(10000, latest.amount * 5),
    );
    for (const frequency of ["MONTHLY", "YEARLY"] as const) {
      const needed = frequency === "MONTHLY" ? 3 : 2;
      const evidence = rows.slice(-needed);
      if (evidence.length < needed) continue;
      const okay = evidence.slice(1).every((r, i) => {
        const days =
          (Date.parse(r.date) - Date.parse(evidence[i].date)) / 86400000;
        return frequency === "MONTHLY"
          ? days >= 26 && days <= 35
          : days >= 350 && days <= 380;
      });
      if (okay) {
        suggestions.push({
          merchant,
          name: latest.description,
          amount: latest.amount,
          frequency,
          nextRenewal: recurrenceDate(latest.date, frequency, 1),
          accountId: latest.accountId,
          categoryId: latest.categoryId,
          evidence,
        });
        break;
      }
    }
  }
  return suggestions;
}
