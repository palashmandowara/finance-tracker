import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { options } from "@/lib/queries";
import { scheduleData } from "@/lib/schedule-data";
import { indiaToday } from "@/lib/months";
import { eventStatus } from "@/lib/schedules";
import { inr } from "@/lib/money";
import { PageHeading } from "@/components/ui";
import { BillForm } from "@/components/schedule-forms";
export default async function Bills() {
  const user = await requireUser();
  const [occurrences, { accounts }, bills] = await Promise.all([
    scheduleData(user.id),
    options(user.id),
    getDb().bill.findMany({
      where: { userId: user.id },
      orderBy: { title: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Plan the payments ahead"
        title="Bills"
        description="Individual due dates and payment history. Full payments only."
      />
      <p className="muted mb-6">
        Schedules never affect balances. Link a matching existing payment or
        explicitly record a new full payment. Credit-card statement amounts are
        entered manually.
      </p>
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <section>
          <h2 className="mb-5">Bill occurrences</h2>
          {!occurrences.length && (
            <p className="panel p-6 muted">
              No bills yet. Add a schedule to see its due dates here.
            </p>
          )}
          {occurrences.map((o) => (
            <article className="panel p-5 mb-4" key={o.id}>
              <h2>
                <Link className="underline" href={"/dashboard/bills/" + o.id}>
                  {o.title}
                </Link>
              </h2>
              <p className="mt-3">
                {o.dueDate.toISOString().slice(0, 10)} · {inr(o.amount)} ·{" "}
                {o.cancelled
                  ? "Cancelled"
                  : eventStatus(
                      o.dueDate.toISOString().slice(0, 10),
                      o.payments.some((p) => p.valid),
                      indiaToday(),
                    )}
              </p>
            </article>
          ))}
        </section>
        <section className="panel p-6">
          <h2 className="mb-5">Add bill</h2>
          <BillForm accounts={accounts} />
        </section>
      </div>
      <section className="mt-8">
        <h2 className="mb-5">Edit schedules</h2>
        {bills.map((b) => (
          <details key={b.id} className="panel p-5 mb-4">
            <summary>
              {b.title} · {b.recurrence.toLowerCase()}
            </summary>
            <div className="mt-5 max-w-xl">
              {b.subscriptionId ? (
                <Link
                  className="underline"
                  href={"/dashboard/subscriptions/" + b.subscriptionId}
                >
                  Edit linked subscription
                </Link>
              ) : (
                <BillForm
                  accounts={accounts}
                  value={{
                    ...b,
                    startDate: b.startDate.toISOString().slice(0, 10),
                  }}
                />
              )}
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
