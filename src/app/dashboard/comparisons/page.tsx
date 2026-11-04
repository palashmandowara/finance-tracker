import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { monthReport } from "@/lib/reports";
import { currentMonth, shiftMonth, monthLabel, comparison } from "@/lib/months";
import { monthSchema } from "@/lib/planning-validation";
import { inr } from "@/lib/money";
import { PageHeading, EmptyState } from "@/components/ui";
function Change({ current, previous }: { current: number; previous: number }) {
  const { delta, percent } = comparison(current, previous);
  return (
    <>
      <span>
        {delta > 0 ? "+" : ""}
        {inr(delta)}
      </span>
      <span className="muted block text-xs mt-1">
        {percent === null
          ? previous === current
            ? "Both months zero"
            : "No percentage: baseline is zero"
          : `${percent > 0 ? "+" : ""}${percent}%`}
      </span>
    </>
  );
}
export default async function Comparisons({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; baseline?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = new Date();
  const current = currentMonth(now);
  const a = monthSchema.safeParse(params.month ?? current);
  const b = monthSchema.safeParse(params.baseline ?? shiftMonth(current, -1));
  const valid =
    a.success && b.success && a.data <= current && b.data <= current;
  const month = valid ? a.data : current;
  const baseline = valid ? b.data : shiftMonth(current, -1);
  const [report, previous, categories] = await Promise.all([
    monthReport(user.id, month, now),
    monthReport(user.id, baseline, now),
    getDb().category.findMany({
      where: { userId: user.id, type: "EXPENSE" },
      orderBy: { name: "asc" },
    }),
  ]);
  const used = categories.filter(
    (c) => report.categories[c.id] || previous.categories[c.id],
  );
  return (
    <>
      <PageHeading
        eyebrow="See how your months compare"
        title="Monthly comparisons"
        description="Income, expenses, and the difference between them."
      />
      <form
        action="/dashboard/comparisons"
        className="panel p-5 flex flex-wrap items-end gap-4 mb-6"
      >
        <label>
          Selected month
          <input
            type="month"
            name="month"
            required
            min="1900-01"
            max={current}
            defaultValue={month}
          />
        </label>
        <label>
          Baseline month
          <input
            type="month"
            name="baseline"
            required
            min="1900-01"
            max={current}
            defaultValue={baseline}
          />
        </label>
        <button className="btn btn-secondary">Compare months</button>
      </form>
      {!valid && (
        <p role="alert" className="error mb-5">
          Choose valid months no later than the current month. Showing the
          default comparison.
        </p>
      )}
      <p className="muted mb-6">
        Asia/Kolkata calendar dates. The current month is month-to-date through
        today; earlier months are complete months, so periods may differ in
        length. Net income = income − expenses. Changes are selected month minus
        baseline; a negative baseline uses its absolute value for the
        percentage.
      </p>
      <section className="panel overflow-x-auto mb-6">
        <table aria-label="Monthly comparison">
          <thead>
            <tr>
              <th>Metric</th>
              <th>{monthLabel(month, now)}</th>
              <th>{monthLabel(baseline, now)} (baseline)</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Income", "income"],
                ["Expenses", "expense"],
                ["Net income", "net"],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>{inr(report[key])}</td>
                <td>{inr(previous[key])}</td>
                <td>
                  <Change current={report[key]} previous={previous[key]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel overflow-hidden">
        <h2 className="p-6">Category spending changes</h2>
        {used.length ? (
          <div className="overflow-x-auto">
            <table aria-label="Category comparison">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Selected month</th>
                  <th>Baseline</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {used.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{inr(report.categories[c.id] ?? 0)}</td>
                    <td>{inr(previous.categories[c.id] ?? 0)}</td>
                    <td>
                      <Change
                        current={report.categories[c.id] ?? 0}
                        previous={previous.categories[c.id] ?? 0}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No category spending to compare."
            description="Record expenses in either selected month to see changes here."
          />
        )}
      </section>
    </>
  );
}
