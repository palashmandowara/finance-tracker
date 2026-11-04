// Transaction DATE values are Kolkata calendar dates, encoded at UTC midnight.
// Never apply a timezone offset to these already date-only database values.
export function indiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function currentMonth(now = new Date()) {
  return indiaToday(now).slice(0, 7);
}
export function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}
export function monthRange(month: string, now = new Date()) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const next = new Date(`${shiftMonth(month, 1)}-01T00:00:00.000Z`);
  const tomorrow = new Date(`${indiaToday(now)}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { gte: start, lt: next < tomorrow ? next : tomorrow };
}
export function monthLabel(month: string, now = new Date()) {
  const label = new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
  return (
    label +
    (month === currentMonth(now)
      ? " · month-to-date"
      : month > currentMonth(now)
        ? " · planned month"
        : "")
  );
}
export function budgetUsage(spent: number, limit: number) {
  const percent = Math.round((spent * 10000) / limit) / 100;
  const status =
    spent > limit
      ? "Over budget"
      : spent === limit
        ? "At budget"
        : spent * 100 >= limit * 80
          ? "Approaching limit"
          : "On track";
  return { remaining: limit - spent, percent, status };
}
export function comparison(current: number, previous: number) {
  const delta = current - previous;
  return {
    delta,
    percent:
      previous === 0
        ? null
        : Math.round((delta * 10000) / Math.abs(previous)) / 100,
  };
}
