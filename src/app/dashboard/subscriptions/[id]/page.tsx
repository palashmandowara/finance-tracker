import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { options } from "@/lib/queries";
import { inr } from "@/lib/money";
import { estimatedCosts } from "@/lib/schedules";
import { PageHeading } from "@/components/ui";
import { SubscriptionForm, ScheduleAction } from "@/components/schedule-forms";
import { subscriptionCommand } from "@/app/schedule-actions";
export default async function SubscriptionDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const s = await getDb().subscription.findFirst({
    where: { id, userId: user.id },
    include: { bill: true },
  });
  if (!s) notFound();
  const { accounts, categories } = await options(user.id);
  const costs = estimatedCosts(s.amount, s.frequency);
  return (
    <>
      <PageHeading
        eyebrow="Subscription details"
        title={s.name}
        description={
          s.paused
            ? "Paused — no upcoming renewal reminders."
            : "Active — estimates only, no automatic expenses."
        }
      />
      <Link className="underline" href="/dashboard/subscriptions">
        All subscriptions
      </Link>
      <p className="my-5">
        Estimated {inr(costs.monthly)} per month · {inr(costs.annual)}{" "}
        annualised.
      </p>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="panel p-6">
          <SubscriptionForm
            accounts={accounts}
            categories={categories.filter((c) => c.type === "EXPENSE")}
            value={{
              ...s,
              nextRenewal: s.nextRenewal.toISOString().slice(0, 10),
            }}
          />
        </section>
        <section className="panel p-6 space-y-6">
          <h2>Renewal and payment tracking</h2>
          <p className="muted">
            The renewal date is the recurrence anchor. Future dates are
            projected without posting expenses. To record payments, track this
            subscription as a bill; its bill occurrences replace the separate
            renewal calendar events.
          </p>
          {s.bill ? (
            <Link className="btn btn-secondary" href="/dashboard/bills">
              View linked bill schedule
            </Link>
          ) : (
            <ScheduleAction action={subscriptionCommand} label="Track as bill">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="command" value="bill" />
            </ScheduleAction>
          )}
          <ScheduleAction
            action={subscriptionCommand}
            label={s.paused ? "Resume subscription" : "Pause subscription"}
          >
            <input type="hidden" name="id" value={s.id} />
            <input
              type="hidden"
              name="command"
              value={s.paused ? "resume" : "pause"}
            />
          </ScheduleAction>
          <ScheduleAction
            action={subscriptionCommand}
            label="Delete subscription"
            confirmText="Delete this subscription? Existing expenses and payment history remain; future linked bill occurrences are cancelled."
          >
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="command" value="delete" />
          </ScheduleAction>
        </section>
      </div>
    </>
  );
}
