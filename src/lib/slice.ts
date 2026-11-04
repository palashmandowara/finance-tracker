import { statementAmount, normalize } from "./statements";
export const SLICE_MAX_ROWS = 5000;
const labels = [
  "DATE",
  "DETAILS",
  "REF NO.",
  "TRANSACTION TYPE",
  "DEBIT",
  "CREDIT",
  "BALANCE",
];
const label = (s: string) =>
  s.trim().toUpperCase().replace(/\s+/g, " ").replace(/\.$/, "");
export function sliceHeader(rows: string[][]) {
  return rows.findIndex((r) =>
    labels.every((h) => r.filter((c) => label(c) === label(h)).length === 1),
  );
}
export type SliceRow = {
  order: number;
  date: string;
  description: string;
  reference: string;
  transactionType: string;
  debit: number;
  credit: number;
  balance: number;
  error: string;
};
export type SliceStatement = {
  rows: SliceRow[];
  count: number;
  incoming: number;
  outgoing: number;
  opening: number;
  closing: number;
  from: string;
  to: string;
  closingDate: string;
  errors: string[];
  ignored: number;
};
export function sliceDate(value: string) {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const m = value
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3})\s+['’]?(\d{2}|\d{4})$/);
  let iso = value.trim();
  if (m) {
    const month = months.indexOf(m[2].toLowerCase()) + 1;
    if (!month) throw new Error("Unknown date month");
    iso = `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    throw new Error("Unrecognised or invalid date");
  return iso;
}
function amount(v: string, blank = false) {
  if (blank && /^(?:\s*|-|—)$/.test(v)) return 0;
  const n = statementAmount(v);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 2147483647)
    throw new Error("Invalid amount");
  return n;
}
export function analyseSlice(source: string[][]): SliceStatement {
  const header = sliceHeader(source);
  if (header < 0) throw new Error("Slice header was not found.");
  const cols = labels.map((h) =>
    source[header].findIndex((c) => label(c) === label(h)),
  );
  const rows: SliceRow[] = [];
  const errors: string[] = [];
  let ignored = header;
  for (let index = header + 1; index < source.length; index++) {
    const c = cols.map((i) => source[index][i] ?? "");
    if (
      c.every((v) => !v.trim()) ||
      labels.every((h, i) => label(c[i]) === label(h))
    ) {
      ignored++;
      continue;
    }
    if (
      /^(?:opening balance|closing balance|balance brought forward|balance carried forward|grand total|total(?: debits?| credits?)?)\s*:?(?:\s|$)/i.test(
        (c[0] + " " + c[1]).trim(),
      )
    ) {
      ignored++;
      continue;
    }
    const row: SliceRow = {
      order: index + 1,
      date: "",
      description: c[1],
      reference: c[2],
      transactionType: c[3],
      debit: 0,
      credit: 0,
      balance: 0,
      error: "",
    };
    try {
      if (
        c.some((v) => v.startsWith("[Unsupported") || v.startsWith("[Unsafe"))
      )
        throw new Error(
          "Use plain text references and values, not formulas or unsafe numeric references",
        );
      row.date = sliceDate(c[0]);
      row.debit = amount(c[4], true);
      row.credit = amount(c[5], true);
      row.balance = amount(c[6]);
      if (row.debit < 0 || row.credit < 0 || row.debit > 0 === row.credit > 0)
        throw new Error("Expected exactly one positive debit or credit");
      if (
        !row.description.trim() ||
        row.description.length > 500 ||
        row.reference.length > 500
      )
        throw new Error("Missing or oversized details/reference");
    } catch (e) {
      row.error = e instanceof Error ? e.message : "Invalid row";
    }
    rows.push(row);
  }
  if (!rows.length || rows.length > SLICE_MAX_ROWS)
    throw new Error(`Use 1–${SLICE_MAX_ROWS} Slice transactions.`);
  let incoming = 0,
    outgoing = 0;
  const first = rows[0];
  const opening = first.balance - first.credit + first.debit;
  if (Math.abs(opening) > 2147483647)
    errors.push("Inferred opening balance is outside the supported range.");
  let previous = opening;
  let lastDate = "";
  const seen = new Set<string>();
  for (const r of rows) {
    const identity = JSON.stringify([
      sliceIdentity(r),
      r.balance,
      r.description,
    ]);
    if (!r.error && seen.has(identity)) continue;
    seen.add(identity);
    if (!r.error && lastDate && r.date < lastDate)
      r.error = "Dates are not in ascending source order";
    if (!r.error && previous + r.credit - r.debit !== r.balance)
      r.error =
        "Running balance does not match the previous balance + credit − debit";
    if (r.error) errors.push(`Source row ${r.order}: ${r.error}`);
    previous = r.balance;
    lastDate = r.date || lastDate;
    incoming += r.credit;
    outgoing += r.debit;
  }
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();

  return {
    rows,
    count: rows.length,
    incoming,
    outgoing,
    opening,
    closing: previous,
    closingDate: lastDate,
    from: dates[0] || "",
    to: dates.at(-1) || "",
    errors,
    ignored,
  };
}
export const isReversal = (s: string) =>
  /\b(?:reversal|reversed|reversing)\b/i.test(s) && /\bupi\b/i.test(s);
export const possibleOwnTransfer = (s: string) =>
  /\b(?:self[ -]?transfer|own account|between accounts|card repayment|credit card (?:bill|payment)|transfer to self)\b/i.test(
    s,
  );
// Only explicitly labelled UPI/UTR/RRN references: never an arbitrary amount or date.
export function upiReferences(s: string) {
  return [
    ...s.matchAll(
      /\b(?:UPI|UTR|RRN)(?:[\s:/#-]*(?:debit|credit|refund|reversal|reversed|for|of|original|payment|transaction|with|ref(?:erence)?|number|no\.?|id))*[\s:/#-]+(\d{10,18})(?!\d)/gi,
    ),
  ].map((m) => m[1]);
}
export type MatchRecord = {
  id: string;
  date: string;
  amount: number;
  type: string;
  description: string;
  reference: string | null;
};
export function reversalCandidates(row: SliceRow, records: MatchRecord[]) {
  if (
    !row.credit ||
    !(
      isReversal(row.description + " " + row.transactionType) ||
      /\brefund(?:ed)?\b/i.test(row.description)
    )
  )
    return [];
  const refs = upiReferences(row.description);
  if (!refs.length) return [];
  return records.filter(
    (t) =>
      t.type === "EXPENSE" &&
      t.amount === row.credit &&
      t.date <= row.date &&
      Date.parse(row.date) - Date.parse(t.date) <= 90 * 86400000 &&
      refs.some(
        (ref) =>
          upiReferences(t.description).includes(ref) || t.reference === ref,
      ),
  );
}
// Exact source reference is primary identity; fallback includes running balance so equal
// same-day purchases with distinct balance effects remain separate transactions.
export function sliceIdentity(r: SliceRow) {
  return JSON.stringify([
    r.reference || null,
    r.date,
    r.debit,
    r.credit,
    r.reference ? null : normalize(r.description),
    r.reference ? null : r.balance,
  ]);
}
export function sliceDuplicate(r: SliceRow, t: MatchRecord) {
  return (
    t.amount === (r.debit || r.credit) &&
    t.type === (r.debit ? "EXPENSE" : "INCOME") &&
    (r.reference && t.reference
      ? r.reference === t.reference && r.date === t.date
      : r.date === t.date &&
        normalize(r.description) === normalize(t.description))
  );
}
