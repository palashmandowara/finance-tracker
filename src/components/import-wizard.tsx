"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { SliceImport } from "./slice-import";
import { previewSlice } from "@/app/slice-actions";
import type { SliceStatement } from "@/lib/slice";
import type { SlicePreview } from "@/lib/slice-service";
import {
  uploadStatement,
  previewStatement,
  confirmStatement,
} from "@/app/statement-actions";
import {
  reviewSchema,
  type Mapping,
  type ReviewRow,
  type CategoryOption,
} from "@/lib/statements";
export function ImportWizard({
  accounts,
  categories,
}: {
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
}) {
  const [batch, setBatch] = useState<{
    slice?: SliceStatement;
    initialPreview?: SlicePreview;
    id: string;
    headers: string[];
    rows: string[][];
  } | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [account, setAccount] = useState(
    accounts.length === 1 ? accounts[0].id : "",
  );
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [report, setReport] = useState<{
    imported: number;
    skipped: number;
    invalid: number;
    reconciled: number;
    messages: string[];
  } | null>(null);
  function run(work: () => Promise<void>) {
    setError("");
    start(async () => {
      try {
        await work();
      } catch {
        setError("Could not connect. Please try again.");
      }
    });
  }
  function edit(index: number, patch: Partial<ReviewRow>) {
    setRows((current) =>
      current!.map((row, i) =>
        i === index ? { ...row, ...patch, error: "" } : row,
      ),
    );
  }
  if (batch?.slice)
    return (
      <SliceImport
        id={batch.id}
        statement={batch.slice}
        initialPreview={batch.initialPreview}
        initialAccount={account}
        accounts={accounts}
        categories={categories}
      />
    );
  return (
    <div className="grid gap-6">
      <p className="muted">
        Slice: Upload → Automatic summary → Import. Other formats: guided column
        mapping.
      </p>
      <div className="panel p-5">
        <strong>Before you import</strong>
        <p className="muted mt-2">
          Your opening balance should precede the imported period. We never
          replace it with a statement closing balance. Upload a header row
          followed by up to 500 rows for other formats, or up to 5,000 Slice
          transactions. Limits: 40 columns, 2 MB. Slice uses the Statement
          worksheet and finds its header automatically. Other XLSX files: one
          worksheet; use plain values, not formulas. Excel date cells become
          YYYY-MM-DD.
        </p>
        <p className="mt-3">
          <a href="/samples/statement.csv" download className="underline">
            Download fictional CSV
          </a>{" "}
          ·{" "}
          <a href="/samples/statement.xlsx" download className="underline">
            Download fictional XLSX
          </a>
        </p>
      </div>
      {!batch && (
        <form
          className="panel p-6 grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(async () => {
              const result = await uploadStatement(form);
              if (result.error) setError(result.error);
              else if ("id" in result) {
                let initialPreview: SlicePreview | undefined;
                if (result.slice && account) {
                  const analysis = await previewSlice(result.id!, account);
                  initialPreview = analysis.preview;
                  if (analysis.error) setError(analysis.error);
                }
                setBatch({
                  slice: result.slice,
                  initialPreview,
                  id: result.id,
                  headers: result.headers!,
                  rows: result.rows!,
                });
              }
            });
          }}
        >
          <h2>Upload a statement</h2>
          <label>
            Destination account (for automatic Slice analysis)
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Choose account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Statement file
            <input name="file" type="file" accept=".csv,.xlsx" required />
          </label>
          <button
            className="btn justify-self-start"
            disabled={busy || !accounts.length}
          >
            {busy ? "Reading…" : "Upload file"}
          </button>
          {!accounts.length && (
            <Link href="/dashboard/accounts" className="underline">
              Create a destination account first
            </Link>
          )}
        </form>
      )}
      {batch && !rows && (
        <form
          className="panel p-6 grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            run(async () => {
              const result = await previewStatement(
                batch.id,
                account,
                values as unknown as Mapping,
              );
              if (result.error) setError(result.error);
              else setRows(result.rows!);
            });
          }}
        >
          <h2>Map your columns</h2>
          <label>
            Destination account
            <select
              required
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Choose account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              "date",
              "description",
              "debit",
              "credit",
              "amount",
              "type",
              "reference",
            ].map((key) => (
              <label key={key}>
                {key[0].toUpperCase() + key.slice(1)} column
                <select name={key} defaultValue="" required>
                  <option value="" disabled>
                    Choose column
                  </option>
                  {!["date", "description"].includes(key) && (
                    <option value="-1">Not used</option>
                  )}
                  {batch.headers.map((h, i) => (
                    <option value={i} key={i}>
                      {i + 1}. {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <label>
              Amount layout
              <select name="mode" required defaultValue="">
                <option value="" disabled>
                  Confirm layout
                </option>
                <option value="split">Separate debit / credit</option>
                <option value="signed">Signed amount</option>
              </select>
            </label>
            <label>
              Date format
              <select name="dateFormat" required defaultValue="">
                <option value="" disabled>
                  Confirm date format
                </option>
                <option value="DMY">DD/MM/YYYY</option>
                <option value="MDY">MM/DD/YYYY</option>
                <option value="YMD">YYYY-MM-DD</option>
              </select>
            </label>
            <label>
              Positive signed amount means
              <select name="positive" required defaultValue="">
                <option value="" disabled>
                  Confirm convention
                </option>
                <option value="INCOME">Income (negative = expense)</option>
                <option value="EXPENSE">Expense (negative = income)</option>
              </select>
            </label>
          </div>
          <p className="muted text-sm">
            Separate debit = expense and credit = income. The signed convention
            is used only for a signed amount column. A mapped type column must
            agree with the chosen convention.
          </p>
          <details>
            <summary>First three source rows</summary>
            <pre className="overflow-auto text-xs p-4">
              {batch.rows
                .slice(0, 3)
                .map((row) => row.join(" | "))
                .join("\n")}
            </pre>
          </details>
          <button className="btn justify-self-start" disabled={busy}>
            {busy ? "Checking…" : "Review import"}
          </button>
        </form>
      )}
      {rows && !report && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2>Review every row</h2>
              <p className="muted mt-2">
                Possible duplicates default to Skip. Keep both deliberately
                creates another record. For the other side of an existing
                transfer, leave Skip selected.
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setRows(null)}
              disabled={busy}
            >
              Change mapping
            </button>
          </div>
          <p>
            <Link
              href="/dashboard/categories"
              target="_blank"
              className="underline"
            >
              Manage categories
            </Link>
            <span className="muted">
              {" "}
              · If you add categories, reload this page and upload again.
              Uncertain matches need your review.
            </span>
          </p>
          {rows.map((row, i) => {
            const valid = reviewSchema.safeParse(row);
            const issue = row.error
              ? row.error
              : row.blocked
                ? row.error
                : !valid.success
                  ? valid.error.issues[0].message
                  : row.kind === "TRANSACTION" && !row.categoryId
                    ? "Choose a category"
                    : row.kind === "TRANSFER" && !row.otherId
                      ? "Choose the other account for this movement"
                      : "";
            return (
              <article
                className="panel p-5"
                key={row.index}
                aria-label={"Import row " + (i + 2)}
              >
                <div className="flex justify-between gap-4 mb-4">
                  <h2>Row {i + 2}</h2>
                  <label>
                    Decision
                    <select
                      value={row.decision}
                      disabled={row.blocked || busy}
                      onChange={(e) =>
                        edit(i, {
                          decision: e.target.value as ReviewRow["decision"],
                        })
                      }
                    >
                      <option value="SKIP">Skip</option>
                      <option value="IMPORT">Import / reconcile</option>
                      <option value="KEEP">Keep both</option>
                    </select>
                  </label>
                </div>
                {row.blocked ? (
                  <p className="muted">{row.error}</p>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <label>
                        Date
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) => edit(i, { date: e.target.value })}
                        />
                      </label>
                      <label>
                        Description
                        <input
                          value={row.description}
                          maxLength={160}
                          onChange={(e) =>
                            edit(i, { description: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Amount (INR)
                        <input
                          value={row.amount}
                          inputMode="decimal"
                          onChange={(e) => edit(i, { amount: e.target.value })}
                        />
                      </label>
                      <label>
                        Direction
                        <select
                          value={row.type}
                          onChange={(e) =>
                            edit(i, {
                              type: e.target.value as ReviewRow["type"],
                              categoryId: "",
                            })
                          }
                        >
                          <option value="EXPENSE">Money out / expense</option>
                          <option value="INCOME">Money in / income</option>
                        </select>
                      </label>
                      <label>
                        Record as
                        <select
                          value={row.kind}
                          onChange={(e) =>
                            edit(i, {
                              kind: e.target.value as ReviewRow["kind"],
                            })
                          }
                        >
                          <option value="TRANSACTION">Income / expense</option>
                          <option value="TRANSFER">
                            Transfer / card repayment
                          </option>
                        </select>
                      </label>
                      <label>
                        Reference
                        <input
                          value={row.reference}
                          maxLength={120}
                          onChange={(e) =>
                            edit(i, { reference: e.target.value })
                          }
                        />
                      </label>
                      {row.kind === "TRANSFER" ? (
                        <label>
                          Other account
                          <select
                            value={row.otherId}
                            onChange={(e) =>
                              edit(i, { otherId: e.target.value })
                            }
                          >
                            <option value="">Choose other account</option>
                            {accounts
                              .filter((a) => a.id !== account)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : (
                        <label>
                          Category
                          <select
                            value={row.categoryId}
                            onChange={(e) =>
                              edit(i, { categoryId: e.target.value })
                            }
                          >
                            <option value="">Uncategorised — review</option>
                            {categories
                              .filter((c) => c.type === row.type)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </div>
                    {row.kind === "TRANSACTION" && (
                      <div className="mt-4 flex flex-wrap gap-4 items-center">
                        <label className="flex! items-center gap-2">
                          <input
                            className="w-auto! min-h-0!"
                            type="checkbox"
                            checked={row.remember}
                            onChange={(e) =>
                              edit(i, { remember: e.target.checked })
                            }
                          />
                          Remember category for this merchant
                        </label>
                        {row.remember && (
                          <label>
                            Merchant keyword
                            <input
                              value={row.keyword}
                              maxLength={80}
                              placeholder="e.g. campus cafe"
                              onChange={(e) =>
                                edit(i, { keyword: e.target.value })
                              }
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </>
                )}
                {row.matches.length > 0 && (
                  <div className="mt-4 border-l-2 border-[#b8c4b8] pl-4">
                    <strong>Possible duplicate / existing movement</strong>
                    {row.matches.map((m, j) => (
                      <p key={j} className="muted mt-1">
                        {m}
                      </p>
                    ))}
                  </div>
                )}
                {issue && !row.blocked && (
                  <p className="error mt-4">
                    {issue}{" "}
                    {row.decision === "SKIP"
                      ? "(row is skipped)"
                      : "— correct it or skip; otherwise it will be reported invalid."}
                  </p>
                )}
              </article>
            );
          })}
          <p className="muted">
            Only valid selected rows are saved. Invalid rows are reported
            separately. Transfers change both accounts but never income,
            expenses or budgets.
          </p>
          <button
            className="btn justify-self-start"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await confirmStatement(batch!.id, rows);
                if (result.error) setError(result.error);
                else setReport(result.report!);
              })
            }
          >
            {busy ? "Saving…" : "Confirm import"}
          </button>
        </>
      )}
      {report && (
        <section className="panel p-6" aria-label="Import result">
          <h2>Import complete</h2>
          <p className="mt-4">
            Imported: {report.imported} · Skipped: {report.skipped} · Invalid:{" "}
            {report.invalid} · Reconciled: {report.reconciled}
          </p>
          {report.messages.map((m, i) => (
            <p key={i} className="error mt-2">
              {m}
            </p>
          ))}
          <div className="flex gap-3 mt-6">
            <Link href="/dashboard" className="btn">
              Open dashboard
            </Link>
            <Link href="/dashboard/transactions" className="btn btn-secondary">
              View transactions
            </Link>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setBatch(null);
                setRows(null);
                setReport(null);
              }}
            >
              Import another file
            </button>
          </div>
          <p className="muted mt-4">
            Review invalid rows and upload corrections separately. Re-uploaded
            records are checked for duplicates again.
          </p>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
