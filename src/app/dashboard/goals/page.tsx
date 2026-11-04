import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { inr } from "@/lib/money";
import { indiaToday } from "@/lib/months";
import {
  GoalForm,
  ContributionForm,
  RemovePlanningRecord,
} from "@/components/planning-forms";
import { PageHeading, EmptyState } from "@/components/ui";
export default async function Goals() {
  const user = await requireUser();
  const goals = await getDb().savingsGoal.findMany({
    where: { userId: user.id },
    include: {
      contributions: {
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeading
        eyebrow="Make room for what matters"
        title="Savings goals"
        description="Give your savings a purpose, one allocation at a time."
      />
      <p className="panel p-5 mb-6 text-[#536b5b]">
        Contributions are goal allocations only. They do not move money between
        accounts, reserve funds, or create income or expenses. Removing an
        allocation or goal does not change your account balances. You can
        allocate beyond a target.
      </p>
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <section className="grid gap-5">
          {goals.length ? (
            goals.map((g) => {
              const allocated = g.contributions.reduce(
                (sum, c) => sum + c.amount,
                0,
              );
              const remaining = Math.max(0, g.target - allocated);
              const percent = Math.round((allocated * 10000) / g.target) / 100;
              const deadline = g.deadline?.toISOString().slice(0, 10) ?? "";
              return (
                <article
                  key={g.id}
                  className="panel p-6"
                  aria-label={`${g.name} goal`}
                >
                  <h2 className="break-words">{g.name}</h2>
                  <p className="muted mt-2">
                    {deadline ? `Deadline: ${deadline}` : "No deadline"}
                    {deadline && deadline < indiaToday() && remaining > 0
                      ? " · overdue"
                      : ""}
                  </p>
                  <p className="text-lg mt-5">
                    {inr(allocated)} allocated{" "}
                    <span className="muted">of {inr(g.target)}</span>
                  </p>
                  <p className="muted mt-2">
                    {inr(remaining)} remaining · {percent}% funded
                    {remaining === 0 ? " · Target reached" : ""}
                  </p>
                  <progress
                    max={100}
                    value={Math.min(100, percent)}
                    aria-label="Goal progress"
                    className="w-full h-3 my-5 accent-brand"
                  />
                  <ContributionForm goalId={g.id} />
                  <details className="mt-5">
                    <summary className="text-brand">
                      Allocations ({g.contributions.length})
                    </summary>
                    {g.contributions.length ? (
                      <ul className="grid gap-4 mt-4">
                        {g.contributions.map((c) => (
                          <li
                            key={c.id}
                            className="flex flex-wrap justify-between gap-3 items-center border-t border-[#d7dcd0] pt-4"
                          >
                            <div>
                              <p>{inr(c.amount)}</p>
                              <p className="muted text-xs">
                                {new Intl.DateTimeFormat("en-IN", {
                                  timeZone: "Asia/Kolkata",
                                  dateStyle: "medium",
                                }).format(c.createdAt)}
                              </p>
                            </div>
                            <RemovePlanningRecord id={c.id} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted mt-4">No allocations yet.</p>
                    )}
                  </details>
                  <details className="my-5">
                    <summary className="text-brand">Edit goal</summary>
                    <div className="pt-4">
                      <GoalForm
                        goal={{
                          id: g.id,
                          name: g.name,
                          target: g.target,
                          deadline,
                        }}
                      />
                    </div>
                  </details>
                  <RemovePlanningRecord id={g.id} goal />
                </article>
              );
            })
          ) : (
            <div className="panel">
              <EmptyState
                title="What are you saving for?"
                description="Create a goal for your emergency fund, a trip, or something you’ve been looking forward to."
              />
            </div>
          )}
        </section>
        <section className="panel p-6">
          <h2 className="mb-5">Create a goal</h2>
          <GoalForm />
        </section>
      </div>
    </>
  );
}
