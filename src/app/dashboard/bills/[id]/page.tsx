import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { options } from "@/lib/queries";
import { inr } from "@/lib/money";
import { indiaToday } from "@/lib/months";
import { eventStatus } from "@/lib/schedules";
import { PageHeading } from "@/components/ui";
import {
  ScheduleAction,
  AccountSelect,
  CategorySelect,
  MoneyInput,
} from "@/components/schedule-forms";
import { payBill, editOccurrence } from "@/app/schedule-actions";
export default async function BillDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const o = await getDb().billOccurrence.findFirst({
    where: { id, userId: user.id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!o) notFound();
  const { accounts, categories } = await options(user.id);
  const paid = o.payments.some((p) => p.valid),
    credit = o.kind === "CREDIT_CARD";
  const choices = credit
    ? (
        await getDb().transfer.findMany({
          where: {
            userId: user.id,
            amount: o.amount,
            ...(o.accountId ? { toId: o.accountId } : {}),
            to: { type: "CREDIT_CARD" },
            from: { type: { not: "CREDIT_CARD" } },
            billPayments: { none: { valid: true } },
          },
          include: { from: true, to: true },
          orderBy: { date: "desc" },
        })
      ).map((t) => ({
        id: t.id,
        label:
          t.date.toISOString().slice(0, 10) +
          " · " +
          t.from.name +
          " → " +
          t.to.name +
          " · " +
          inr(t.amount),
      }))
    : (
        await getDb().transaction.findMany({
          where: {
            userId: user.id,
            type: "EXPENSE",
            amount: o.amount,
            ...(o.accountId ? { accountId: o.accountId } : {}),
            billPayments: { none: { valid: true } },
          },
          include: { account: true },
          orderBy: { date: "desc" },
        })
      ).map((t) => ({
        id: t.id,
        label:
          t.date.toISOString().slice(0, 10) +
          " · " +
          t.description +
          " · " +
          t.account.name +
          " · " +
          inr(t.amount),
      }));
  return (
    <>
      <PageHeading
        eyebrow="Bill occurrence"
        title={o.title}
        description={
          o.dueDate.toISOString().slice(0, 10) +
          " · " +
          inr(o.amount) +
          " · " +
          (o.cancelled
            ? "Cancelled"
            : eventStatus(
                o.dueDate.toISOString().slice(0, 10),
                paid,
                indiaToday(),
              ))
        }
      />
      <Link className="underline" href="/dashboard/bills">
        All bills
      </Link>
      <p className="panel p-5 my-6">
        Full payments only: the amount and relevant account must match.{" "}
        {credit
          ? "This card statement is paid with a linked transfer, never a second expense."
          : "Ordinary payments use an expense transaction."}{" "}
        Editing the linked payment’s amount, date or accounts, or deleting it,
        makes this bill unpaid again while preserving its history.
      </p>
      {!paid && !o.cancelled && (
        <div className="grid lg:grid-cols-2 gap-6">
          <section className="panel p-6">
            <h2 className="mb-5">Link an existing payment</h2>
            <ScheduleAction action={payBill} label="Link payment">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="mode" value="link" />
              <label>
                Matching payment
                <select name="recordId" required defaultValue="">
                  <option value="">
                    Choose an existing {credit ? "repayment" : "expense"}
                  </option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {!choices.length && (
                <p className="muted">No unlinked matching payments found.</p>
              )}
            </ScheduleAction>
          </section>
          <section className="panel p-6">
            <h2 className="mb-5">Record a new payment</h2>
            <ScheduleAction
              action={payBill}
              label="Record full payment"
              confirmText="Record a new full payment? Link an existing payment instead if this has already been paid."
            >
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="mode" value="new" />
              <p>
                Record {inr(o.amount)}{" "}
                {credit ? "as a transfer to the card" : "as an expense"}.
              </p>
              <AccountSelect
                accounts={
                  credit
                    ? accounts.filter((a) => a.type !== "CREDIT_CARD")
                    : accounts
                }
                optional={false}
                label="Paying account"
                value={!credit ? o.accountId || "" : ""}
              />
              {credit && !o.accountId && (
                <AccountSelect
                  accounts={accounts.filter((a) => a.type === "CREDIT_CARD")}
                  optional={false}
                  name="toId"
                  label="Credit-card account"
                />
              )}
              {!credit && (
                <CategorySelect
                  categories={categories.filter((c) => c.type === "EXPENSE")}
                  optional={false}
                />
              )}
              <label>
                Payment date
                <input
                  name="date"
                  type="date"
                  required
                  max={indiaToday()}
                  defaultValue={indiaToday()}
                />
              </label>
            </ScheduleAction>
          </section>
          <details className="panel p-6 lg:col-span-2">
            <summary>Edit this unpaid occurrence</summary>
            <div className="mt-5 max-w-sm">
              <ScheduleAction action={editOccurrence} label="Save occurrence">
                <input type="hidden" name="id" value={o.id} />
                <MoneyInput label="Amount due (INR)" value={o.amount} />
                <label>
                  Due date
                  <input
                    name="dueDate"
                    type="date"
                    required
                    min="2000-01-01"
                    max="2100-12-31"
                    defaultValue={o.dueDate.toISOString().slice(0, 10)}
                  />
                </label>
              </ScheduleAction>
            </div>
          </details>
        </div>
      )}
      <section className="panel p-6 mt-6">
        <h2>Payment history</h2>
        {!o.payments.length && (
          <p className="muted mt-4">No payment linked yet.</p>
        )}
        {o.payments.map((p) => (
          <article key={p.id} className="border-t border-[#d7dcd0] mt-4 pt-4">
            <p>
              {p.paymentDate.toISOString().slice(0, 10)} · {inr(p.amount)} ·{" "}
              {p.valid ? "Active payment" : "Needs review"}
            </p>
            <p className="muted mt-2">{p.note}</p>
          </article>
        ))}
      </section>
    </>
  );
}
