"use client";
import { useActionState } from "react";
import { correctClassification } from "@/app/classification-actions";
import { kinds, type Recognition } from "@/lib/recognition";
export function ClassificationReview({
  id,
  recognition,
  categories,
  accounts,
  type,
  categoryId,
}: {
  id: string;
  recognition: Recognition;
  categories: { id: string; name: string; type: string }[];
  accounts: { id: string; name: string }[];
  type: string;
  categoryId: string;
}) {
  const [state, action, pending] = useActionState(correctClassification, {});
  return (
    <details className="mt-2">
      <summary className="text-xs underline">Review classification</summary>
      <form action={action} className="grid gap-3 mt-3 min-w-64 max-w-80">
        <input type="hidden" name="id" value={id} />
        <p className="muted text-xs">
          Suggested: {recognition.merchant || "Unknown"} · {recognition.kind}.{" "}
          {recognition.confidence} evidence: {recognition.evidence.join("; ")}.
          Cash direction: {type === "EXPENSE" ? "Debit" : "Credit"}. Changes
          apply only when you confirm.
        </p>
        <label>
          Merchant
          <input
            name="merchant"
            maxLength={160}
            defaultValue={recognition.merchant.slice(0, 160)}
          />
        </label>
        <label>
          Financial purpose
          <select name="kind" defaultValue={recognition.kind}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            name="categoryId"
            defaultValue={recognition.categoryId ?? categoryId}
          >
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Subcategory
          <input
            name="subcategory"
            maxLength={80}
            defaultValue={recognition.subcategory}
          />
        </label>
        <label>
          Other owned account (transfers/repayments/cash)
          <select name="otherId" defaultValue="">
            <option value="">Not a linked movement</option>
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex! gap-2 text-xs">
          <input className="w-auto! min-h-0!" type="checkbox" name="remember" />
          Remember for this merchant / UPI identifier
        </label>
        <p className="muted text-xs">
          Classifying a linked transfer replaces this ordinary transaction with
          one movement between the selected accounts. Its original description,
          amount and reference remain intact.
        </p>
        <button className="btn btn-secondary" disabled={pending}>
          {pending ? "Saving…" : "Confirm classification"}
        </button>
        {state.error && (
          <p role="alert" className="error">
            {state.error}
          </p>
        )}
        {state.success && <p role="status">Classification saved.</p>}
      </form>
    </details>
  );
}
