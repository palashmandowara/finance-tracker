import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { options } from "@/lib/queries";
import { inr } from "@/lib/money";
import { indiaToday, shiftMonth } from "@/lib/months";
import { estimatedCosts, scheduleDates } from "@/lib/schedules";
import { recurringSuggestions } from "@/lib/schedule-data";
import { PageHeading } from "@/components/ui";
import { SubscriptionForm, ScheduleAction } from "@/components/schedule-forms";
import { suggestionCommand } from "@/app/schedule-actions";
export default async function Subscriptions() {
  const user = await requireUser();
  const [subs, { accounts, categories }, suggestions] = await Promise.all([
    getDb().subscription.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
    options(user.id),
    recurringSuggestions(user.id),
  ]);
  const active = subs.filter((s) => !s.paused);
  const annual = active.reduce(
    (sum, s) => sum + estimatedCosts(s.amount, s.frequency).annual,
    0,
  );
  const today = indiaToday();
  return (
    <>
      <PageHeading
        eyebrow="Know what repeats"
        title="Subscriptions"
        description="Estimates and renewal reminders. Never automatic expenses."
      />
      <section className="grid sm:grid-cols-3 gap-4 mb-7">
        <div className="panel p-5">
          <p className="muted">Active subscriptions</p>
          <p className="stat mt-3">{active.length}</p>
        </div>
        <div className="panel p-5">
          <p className="muted">Estimated monthly equivalent</p>
          <p className="stat mt-3">{inr(Math.round(annual / 12))}</p>
        </div>
        <div className="panel p-5">
          <p className="muted">Estimated annualised cost</p>
          <p className="stat mt-3">{inr(annual)}</p>
        </div>
      </section>
      <p className="muted mb-6">
        Annual plans are spread over 12 months for the estimate, rounded to the
        nearest paise. Taxes, price changes and cancellations may change actual
        spending.
      </p>
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <section className="grid gap-4">
          {!subs.length && (
            <p className="panel p-6 muted">
              No subscriptions tracked yet. Add one manually or review a
              suggestion below.
            </p>
          )}
          {subs.map((s) => {
            const next = scheduleDates(
              s.nextRenewal.toISOString().slice(0, 10),
              s.frequency,
              today,
              shiftMonth(today.slice(0, 7), 13) + "-28",
            )[0];
            return (
              <article className="panel p-5" key={s.id}>
                <h2>
                  <Link
                    className="underline"
                    href={"/dashboard/subscriptions/" + s.id}
                  >
                    {s.name}
                  </Link>
                </h2>
                <p className="mt-3">
                  {inr(s.amount)} · {s.frequency.toLowerCase()} ·{" "}
                  {s.paused ? "Paused" : "Active"}
                </p>
                <p className="muted mt-2">
                  {s.paused
                    ? "Renewal reminders paused"
                    : next
                      ? "Upcoming renewal: " + next
                      : "Check the renewal anchor date"}
                </p>
              </article>
            );
          })}
        </section>
        <section className="panel p-6">
          <h2 className="mb-5">Add subscription</h2>
          <SubscriptionForm
            accounts={accounts}
            categories={categories.filter((c) => c.type === "EXPENSE")}
          />
        </section>
      </div>
      <section className="mt-10">
        <h2>Possible recurring payments</h2>
        <p className="muted mt-3 mb-5">
          Suggestions are not subscriptions until you confirm them. We look for
          at least three monthly or two yearly expenses with a similar merchant
          and amount.
        </p>
        {!suggestions.length && (
          <p className="panel p-5 muted">
            No new suggestions. Tracked and dismissed merchants are excluded.
          </p>
        )}
        {suggestions.map((s) => (
          <article
            className="panel p-5 mb-4"
            key={s.merchant}
            aria-label={s.name + " suggestion"}
          >
            <h2>{s.name}</h2>
            <p className="mt-3">
              Possible {s.frequency.toLowerCase()} payment · {inr(s.amount)}
            </p>
            <ul className="muted mt-3">
              {s.evidence.map((e) => (
                <li key={e.id}>
                  {e.date} · {e.description} · {inr(e.amount)}
                </li>
              ))}
            </ul>
            <div className="flex gap-4 mt-5">
              {["confirm", "dismiss"].map((command) => (
                <ScheduleAction
                  key={command}
                  action={suggestionCommand}
                  label={
                    command === "confirm"
                      ? "Confirm subscription"
                      : "Dismiss suggestion"
                  }
                >
                  <input type="hidden" name="merchant" value={s.merchant} />
                  <input type="hidden" name="command" value={command} />
                </ScheduleAction>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
