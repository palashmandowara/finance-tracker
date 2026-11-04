import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { options } from "@/lib/queries";
import { inr } from "@/lib/money";
import { PageHeading } from "@/components/ui";
import { TransferForm, DeleteTransfer } from "@/components/transfer-form";
export default async function Transfers() {
  const user = await requireUser();
  const [{ accounts }, rows] = await Promise.all([
    options(user.id),
    getDb().transfer.findMany({
      where: { userId: user.id },
      include: { from: true, to: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Between your accounts"
        title="Transfers & card repayments"
        description="One linked movement. No new income or expense."
      />
      <p className="panel p-5 mb-6">
        Card balances use a negative sign for money owed. A purchase makes the
        card balance more negative; a repayment moves money from your bank to
        the card and reduces the debt. A positive card balance is credit in your
        favour. Opening balances are never changed automatically.
      </p>
      <Link className="underline" href="/dashboard/transactions">
        Back to transactions
      </Link>
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 mt-6">
        <section className="grid gap-4 content-start">
          {!rows.length && (
            <p className="panel p-6 muted">
              No transfers yet. Choose two of your accounts to record a
              movement.
            </p>
          )}
          {rows.map((t) => (
            <article className="panel p-5" key={t.id}>
              <h2>{t.description}</h2>
              <p className="mt-3">
                {t.from.name} → {t.to.name}
              </p>
              <p className="muted mt-2 mb-4">
                {t.date.toISOString().slice(0, 10)} · {inr(t.amount)}
                {t.reference ? " · " + t.reference : ""}
              </p>
              <DeleteTransfer id={t.id} />
            </article>
          ))}
        </section>
        <section className="panel p-6">
          <TransferForm accounts={accounts} />
        </section>
      </div>
    </>
  );
}
