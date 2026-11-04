import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { monthReport } from "@/lib/reports";
import { currentMonth, monthLabel, budgetUsage } from "@/lib/months";
import { monthSchema } from "@/lib/planning-validation";
import { inr } from "@/lib/money";
import { BudgetForm } from "@/components/planning-forms";
import { MonthPicker } from "@/components/month-picker";
import { PageHeading, EmptyState } from "@/components/ui";
export default async function Budgets({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = new Date();
  const parsed = monthSchema.safeParse(params.month ?? currentMonth(now));
  const month = parsed.success ? parsed.data : currentMonth(now);
  const [budgets, categories, report] = await Promise.all([
    getDb().budget.findMany({
      where: { userId: user.id, month },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    }),
    getDb().category.findMany({
      where: { userId: user.id, type: "EXPENSE" },
      orderBy: { name: "asc" },
    }),
    monthReport(user.id, month, now),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Give your month a plan"
        title="Monthly budgets"
        description={monthLabel(month, now)}
      />
      <MonthPicker month={month} action="/dashboard/budgets" />
      {!parsed.success && (
        <p role="alert" className="error mb-5">
          Invalid month. Showing this month.
        </p>
      )}
      <p className="muted mb-6">
        Overall and category limits are independent. Category budgets are not
        added to the overall limit. Usage counts recorded expenses through today
        in Asia/Kolkata.
      </p>
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <section className="grid gap-5">
          {budgets.length ? (
            budgets.map((b) => {
              const spent = b.categoryId
                ? (report.categories[b.categoryId] ?? 0)
                : report.expense;
              const usage = budgetUsage(spent, b.amount);
              return (
                <article
                  key={b.id}
                  className="panel p-6"
                  aria-label={`${b.category?.name ?? "Overall expenses"} budget`}
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <h2>{b.category?.name ?? "Overall expenses"}</h2>
                    <span
                      className={
                        usage.status === "Over budget"
                          ? "text-red-800"
                          : usage.status === "On track"
                            ? "text-brand"
                            : "text-amber-800"
                      }
                    >
                      {usage.status}
                    </span>
                  </div>
                  <p className="mt-5 text-lg">
                    {inr(spent)} spent{" "}
                    <span className="muted">of {inr(b.amount)}</span>
                  </p>
                  <p className="muted mt-2">
                    {usage.remaining < 0
                      ? `${inr(-usage.remaining)} over budget`
                      : `${inr(usage.remaining)} remaining`}{" "}
                    · {usage.percent}% used
                  </p>
                  <progress
                    aria-label="Budget usage"
                    max={100}
                    value={Math.min(100, usage.percent)}
                    className="w-full h-3 my-5 accent-brand"
                  />
                  {usage.status !== "On track" && (
                    <p role="status" className="mb-4 text-amber-800">
                      {usage.status === "Over budget"
                        ? "You have exceeded this month's limit."
                        : usage.status === "At budget"
                          ? "You have reached this month's limit."
                          : "You have used at least 80% of this month's limit."}
                    </p>
                  )}
                  <details>
                    <summary className="text-brand">Edit budget</summary>
                    <div className="pt-4">
                      <BudgetForm
                        month={month}
                        categories={categories}
                        budget={b}
                      />
                    </div>
                  </details>
                </article>
              );
            })
          ) : (
            <div className="panel">
              <EmptyState
                title="A little planning goes a long way."
                description="Set an overall monthly limit or start with an expense category."
              />
            </div>
          )}
        </section>
        <section className="panel p-6">
          <h2 className="mb-5">Set a monthly limit</h2>
          <BudgetForm key={month} month={month} categories={categories} />
          <p className="muted mt-4 text-xs">
            Setting the same scope again updates its existing limit. Create
            expense categories on the Categories page.
          </p>
        </section>
      </div>
    </>
  );
}
