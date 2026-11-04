"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { previewSlice, confirmSlice } from "@/app/slice-actions";
import type { SliceStatement } from "@/lib/slice";
import type {
  SlicePreview,
  SliceChoice,
  SliceResult,
} from "@/lib/slice-service";
import { kinds, type FinancialKind } from "@/lib/recognition";
import { inr } from "@/lib/money";
export function SliceImport({
  id,
  statement,
  initialPreview,
  initialAccount,
  accounts,
  categories,
}: {
  id: string;
  statement: SliceStatement;
  initialPreview?: SlicePreview;
  initialAccount: string;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; type: string }[];
}) {
  const [account, setAccount] = useState(initialAccount);
  const [preview, setPreview] = useState(initialPreview);
  const [choices, setChoices] = useState<Record<number, SliceChoice>>({});
  const [opening, setOpening] = useState(false);
  const [report, setReport] = useState<SliceResult>();
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  function change(order: number, patch: Partial<SliceChoice>) {
    setChoices((v) => ({
      ...v,
      [order]: { ...(v[order] ?? { order, action: "IMPORT" }), ...patch },
    }));
  }
  function run(work: () => Promise<void>) {
    setError("");
    start(async () => {
      try {
        await work();
      } catch {
        setError("Could not connect. Please retry safely.");
      }
    });
  }
  const unresolved =
    preview?.rows.filter(
      (r) =>
        r.issue &&
        !r.duplicate &&
        (!choices[r.order] ||
          choices[r.order].action === "IMPORT" ||
          (choices[r.order].action === "TRANSFER" &&
            !choices[r.order].otherId)),
    ) ?? [];
  const duplicates = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const detail = (r: SlicePreview["rows"][number]) => (
    <tr key={r.order}>
      <td>
        {r.order}
        <br />
        <span className="muted text-xs">{r.date}</span>
      </td>
      <td className="max-w-80 break-words">
        <p>{r.description}</p>
        <p className="text-sm mt-2">
          {r.recognition.merchant || "Unknown merchant"} · {r.recognition.kind}{" "}
          · {r.recognition.category || "Uncategorised"}
          {r.recognition.subcategory && " / " + r.recognition.subcategory}
        </p>
        <p className="muted text-xs">
          {r.recognition.confidence} evidence ·{" "}
          {r.recognition.review ? "Needs review" : "Recognised"}:{" "}
          {r.recognition.evidence.join("; ")}
        </p>
        <p className="muted text-xs">Ref: {r.reference || "Not supplied"}</p>
        {r.reversalOf && (
          <p className="text-brand text-xs mt-2">
            Matched UPI reversal · offsets original spending
          </p>
        )}
        {r.issue && <p className="error text-sm mt-2">{r.issue}</p>}
        {r.duplicate && (
          <p className="muted text-sm mt-2">Skipped duplicate: {r.duplicate}</p>
        )}
      </td>
      <td className="whitespace-nowrap">
        {r.debit ? "−" : "+"}
        {inr(r.debit || r.credit)}
        <br />
        <span className="muted text-xs">Balance {inr(r.balance)}</span>
      </td>
      <td>
        {r.duplicate ? (
          "Skip"
        ) : (
          <div className="grid gap-2 min-w-44">
            <label>
              Row {r.order} action
              <select
                aria-label={`Row ${r.order} action`}
                disabled={busy}
                value={choices[r.order]?.action ?? "IMPORT"}
                onChange={(e) =>
                  change(r.order, {
                    action: e.target.value as SliceChoice["action"],
                  })
                }
              >
                <option value="IMPORT">Automatic</option>
                <option value="TRANSACTION">
                  {r.reversalOf
                    ? "Keep matched reversal"
                    : "Ordinary transaction"}
                </option>
                <option value="TRANSFER">Own-account transfer</option>
                <option value="DEFER">Keep movement · review later</option>
              </select>
            </label>
            {!r.reversalOf && (
              <label>
                Financial purpose
                <select
                  aria-label={`Row ${r.order} purpose`}
                  value={choices[r.order]?.kind ?? r.recognition.kind}
                  onChange={(e) =>
                    change(r.order, {
                      kind: e.target.value as FinancialKind,
                      action: "TRANSACTION",
                    })
                  }
                >
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {choices[r.order]?.action === "TRANSFER" ? (
              <label>
                Other account
                <select
                  aria-label={`Row ${r.order} other account`}
                  value={choices[r.order]?.otherId ?? ""}
                  onChange={(e) => change(r.order, { otherId: e.target.value })}
                >
                  <option value="">Choose account</option>
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
              !r.reversalOf && (
                <label>
                  Category
                  <select
                    aria-label={`Row ${r.order} category`}
                    value={choices[r.order]?.categoryId ?? r.categoryId}
                    onChange={(e) =>
                      change(r.order, { categoryId: e.target.value })
                    }
                  >
                    <option value="">Uncategorised</option>
                    {categories
                      .filter(
                        (c) => c.type === (r.debit ? "EXPENSE" : "INCOME"),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )
            )}
            {!r.reversalOf && (
              <label className="flex! gap-2">
                <input
                  className="w-auto! min-h-0!"
                  type="checkbox"
                  checked={choices[r.order]?.remember ?? false}
                  onChange={(e) =>
                    change(r.order, { remember: e.target.checked })
                  }
                />
                Remember confirmed merchant classification
              </label>
            )}
          </div>
        )}
      </td>
    </tr>
  );
  return (
    <section className="grid gap-6" aria-label="Slice automatic import">
      <div className="panel p-6">
        <p className="eyebrow">Slice format detected</p>
        <h2 className="mt-2">Your statement, ready to review.</h2>
        <p className="muted mt-2">
          {statement.count} transactions · {statement.from} to {statement.to}.
          Header and metadata recognised automatically.
        </p>
        {!report && (
          <form
            className="flex flex-wrap gap-4 items-end mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await previewSlice(id, account);
                if (result.error) setError(result.error);
                else {
                  setPreview(result.preview);
                  setChoices({});
                  setOpening(false);
                }
              });
            }}
          >
            <label>
              Destination account
              <select
                aria-label="Destination account"
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setPreview(undefined);
                  setOpening(false);
                }}
                required
                disabled={busy}
              >
                {!account && <option value="">Choose account</option>}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {!preview && (
              <button className="btn" disabled={busy}>
                {busy ? "Analysing…" : "Analyse account"}
              </button>
            )}
          </form>
        )}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ["Incoming", statement.incoming],
          ["Outgoing", statement.outgoing],
          ["Inferred opening", statement.opening],
          ["Statement closing", statement.closing],
        ].map(([title, value]) => (
          <div className="panel p-5" key={title}>
            <p className="muted text-sm">{title}</p>
            <p className="text-xl mt-3 font-medium">{inr(Number(value))}</p>
          </div>
        ))}
      </div>
      <p className="muted text-sm">
        Incoming and outgoing describe bank movements, not necessarily earned
        income or consumption. Matched UPI reversals offset spending on the
        credit date. Own-account transfers stay outside income and expenses.
      </p>
      {statement.errors.length > 0 && (
        <div className="panel p-5" role="alert">
          <h2>Source file needs attention</h2>
          <p className="mt-2">
            Nothing can be imported until these errors are corrected. Fix the
            source file and upload again.
          </p>
          <ul className="mt-3 list-disc pl-5">
            {statement.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {preview && !report && (
        <>
          <div className="panel p-6">
            <h2>Import summary</h2>
            <p className="muted text-sm mt-2">
              Confirmation preserves existing movements. Matching older entries
              may gain missing source metadata; their amounts, dates and
              classifications are not overwritten.
            </p>
            <p className="mt-3">
              Projected balance at statement end:{" "}
              {inr(
                preview.projectedClosing +
                  (opening ? statement.opening - preview.currentOpening : 0),
              )}
              . Statement balance: {inr(statement.closing)}.
            </p>
            {preview.projectedClosing +
              (opening ? statement.opening - preview.currentOpening : 0) !==
              statement.closing && (
              <p role="alert" className="error mt-3">
                These balances do not reconcile. Check the opening balance and
                existing records. Confirmation will not save an unreconciled
                import.
              </p>
            )}
            <p className="mt-3">
              {preview.rows.length -
                duplicates -
                preview.rows.filter(
                  (r) => !r.duplicate && choices[r.order]?.action === "SKIP",
                ).length}{" "}
              selected · {duplicates} duplicates skipped ·{" "}
              {
                preview.rows.filter(
                  (r) => r.reversalOf && choices[r.order]?.action !== "SKIP",
                ).length
              }{" "}
              matched reversals · {unresolved.length} need attention
            </p>
            <p className="muted mt-2">
              {statement.errors.length
                ? "Balance validation failed."
                : "Every non-duplicate row passes its running-balance check."}{" "}
              Unknown merchants stay pending review. Their cash movements are
              retained without assuming income or spending.
            </p>
            {preview.canSetOpening && (
              <label className="flex! items-start gap-3 mt-5">
                <input
                  className="w-auto! min-h-0! mt-1"
                  type="checkbox"
                  checked={opening}
                  onChange={(e) => setOpening(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Use {inr(statement.opening)} as this empty account’s opening
                  balance.
                  <span className="block muted text-sm mt-1">
                    This is the balance immediately before the first statement
                    transaction, not the closing balance.
                  </span>
                </span>
              </label>
            )}
            <p className="muted mt-4 text-sm">
              Current tracked balance: {inr(preview.trackedBalance)}. Statement
              closing: {inr(statement.closing)} on {statement.closingDate}.{" "}
              {preview.canSetOpening
                ? "Leaving the opening balance unchanged can create a difference."
                : "Your existing opening balance will be preserved."}{" "}
              Missing periods, skipped rows, manually tracked activity and
              transactions after the statement date can explain differences.
            </p>
          </div>
          {preview.rows.some((r) => r.issue && !r.duplicate) && (
            <div className="panel p-5 overflow-auto">
              <h2 className="mb-4">Only these rows need a decision</h2>
              <table>
                <thead>
                  <tr>
                    <th>Source row</th>
                    <th>Details</th>
                    <th>Movement</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .filter((r) => r.issue && !r.duplicate)
                    .map(detail)}
                </tbody>
              </table>
            </div>
          )}
          <details className="panel p-5">
            <summary>Full details & optional category corrections</summary>
            <div className="overflow-auto max-h-[36rem] mt-5">
              <table>
                <thead>
                  <tr>
                    <th>Source row</th>
                    <th>Details</th>
                    <th>Movement</th>
                    <th>Optional changes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows
                    .filter((r) => !r.issue || r.duplicate)
                    .map(detail)}
                </tbody>
              </table>
            </div>
          </details>
          <button
            className="btn justify-self-start"
            disabled={
              busy ||
              !!unresolved.length ||
              !!statement.errors.length ||
              preview.projectedClosing +
                (opening ? statement.opening - preview.currentOpening : 0) !==
                statement.closing
            }
            onClick={() =>
              run(async () => {
                const result = await confirmSlice(
                  id,
                  Object.values(choices),
                  opening,
                );
                if (result.error) setError(result.error);
                else setReport(result.report);
              })
            }
          >
            {busy ? "Importing…" : "Import statement"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {report && (
        <div className="panel p-6" aria-label="Slice import result">
          <h2>Import reconciled</h2>
          <p className="mt-3">
            Imported: {report.imported} · Skipped: {report.skipped} · Reversals:{" "}
            {report.reversals} · Reconciled transfers: {report.reconciled}
          </p>
          <p className="mt-3">
            New movements pending classification: {report.pending ?? 0}.
            Reconciled balance at statement end:{" "}
            {inr(report.reconciledClosing ?? report.statementClosing)}.
          </p>
          <p className="mt-3">
            Tracked account balance: {inr(report.trackedBalance)}
          </p>
          <p className="muted mt-2">
            Statement closing balance: {inr(report.statementClosing)} on{" "}
            {report.closingDate}. Difference:{" "}
            {inr(report.trackedBalance - report.statementClosing)}.
          </p>
          <p className="muted text-sm mt-2">
            The tracked balance includes all saved activity, including dates
            outside this statement. Differences may also reflect the opening
            balance or skipped transactions. No closing balance was used to
            overwrite your account.
          </p>
          <div className="flex gap-3 mt-5">
            <Link className="btn" href="/dashboard">
              Open dashboard
            </Link>
            <Link className="btn btn-secondary" href="/dashboard/transactions">
              View transactions
            </Link>
            <a className="btn btn-secondary" href="/dashboard/import">
              Import another statement
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
