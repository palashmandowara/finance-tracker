import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { classificationPlan } from "@/lib/classification-plan";
import { ConfirmClassificationPlan } from "@/components/confirm-classification-plan";
import { PageHeading } from "@/components/ui";
import { inr } from "@/lib/money";
import Link from "next/link";
export default async function Review() {
  const user = await requireUser();
  const plan = await classificationPlan(getDb(), user.id);
  return (
    <>
      <PageHeading
        title="Review imported classifications"
        eyebrow="Evidence before changes"
        description="Preview the changes to older imports. Nothing is applied until you confirm."
      />
      <div className="panel p-6">
        <h2>{plan.rows.length} existing movements</h2>
        <p className="mt-3">
          {plan.rows.filter((r) => !r.recognition.review).length} recognised ·{" "}
          {plan.rows.filter((r) => r.recognition.review).length} need
          clarification.
        </p>
        <p className="muted mt-3">
          Confirming applies recognised categories and marks uncertain movements
          pending. Pending movements remain in cash balances but are excluded
          from income and spending until clarified. Original descriptions,
          references, dates, amounts and opening balances do not change. This
          does not restore omitted statement rows or repair the account balance;
          re-upload the original statement for reconciliation.
        </p>
        <p className="muted mt-3">
          Review evidence below. Resolve pending movements individually under
          Transactions; own-account movements require selecting the other
          account.
        </p>
        <Link href="/dashboard/transactions" className="underline">
          Transactions
        </Link>
        {plan.rows.length > 0 && (
          <>
            <details className="mt-5">
              <summary>View every proposed classification</summary>
              <div className="overflow-auto max-h-[36rem]">
                <table>
                  <thead>
                    <tr>
                      <th>Original movement</th>
                      <th>Current category</th>
                      <th>Proposed classification</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="max-w-72 break-words">
                          {r.description}
                          <br />
                          {r.date} ·{" "}
                          {r.direction === "EXPENSE" ? "Debit" : "Credit"}{" "}
                          {inr(r.amount)}
                        </td>
                        <td>{r.category}</td>
                        <td>
                          {r.recognition.merchant}
                          <br />
                          {r.recognition.kind} ·{" "}
                          {r.recognition.category || "Uncategorised"} /{" "}
                          {r.recognition.subcategory || "—"}
                          <br />
                          {r.recognition.review
                            ? "Pending review"
                            : r.recognition.effect}
                        </td>
                        <td>
                          {r.recognition.confidence}:{" "}
                          {r.recognition.evidence.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <ConfirmClassificationPlan digest={plan.digest} />
          </>
        )}
      </div>
    </>
  );
}
