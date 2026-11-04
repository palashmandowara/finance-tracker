import { Reminders } from "@/components/reminders";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Wallet, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { options, totals } from "@/lib/queries";
import { inr } from "@/lib/money";
import { PageHeading, EmptyState } from "@/components/ui";
import { TransactionButton } from "@/components/forms";
import { ExpenseChart, MonthlyChart } from "@/components/charts";
import { MonthPicker } from "@/components/month-picker";
import { chartReports } from "@/lib/reports";
import { currentMonth, monthLabel } from "@/lib/months";
import { monthSchema } from "@/lib/planning-validation";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const now = new Date();
  const parsed = monthSchema.safeParse(
    (await searchParams).month ?? currentMonth(now),
  );
  const valid = parsed.success && parsed.data <= currentMonth(now);
  const month = valid ? parsed.data : currentMonth(now);
  const [{ accounts, categories }, summary, recent, monthly] =
    await Promise.all([
      options(user.id),
      totals(user.id),
      getDb().transaction.findMany({
        where: { userId: user.id },
        orderBy: [
          { date: "desc" },
          { sourceOrder: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        take: 5,
        include: { category: true, account: true },
      }),
      chartReports(user.id, month, now),
    ]);
  const cards = [
    {
      label: "Total balance",
      value: summary.cashBalance,
      note: "Across all your accounts",
      icon: Wallet,
    },
    {
      label: "Total income",
      value: summary.income,
      note: "Recorded income, excluding reversals",
      icon: ArrowDownLeft,
    },
    {
      label: "Total expenses",
      value: summary.expense,
      note: "Spending after matched reversals",
      icon: ArrowUpRight,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="Your money, at a glance"
        title={`Hello, ${user.name.split(" ")[0]}.`}
        description="Here’s where you stand. Let’s make every rupee count."
      >
        <TransactionButton accounts={accounts} categories={categories} />
      </PageHeading>
      <div className="flex items-center gap-2 muted text-xs mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        All-time overview · INR
      </div>
      <section
        aria-label="Financial totals"
        className="grid md:grid-cols-3 gap-4 mb-7"
      >
        {cards.map((card, index) => (
          <div
            key={card.label}
            className={`panel p-6 ${index === 0 ? "bg-[#e0eadc]! border-[#bacab5]!" : ""}`}
          >
            <div className="flex justify-between items-center mb-7">
              <p className="text-[#536b5b]">{card.label}</p>
              <card.icon
                size={20}
                className={index === 2 ? "text-[#866041]" : "text-brand"}
              />
            </div>
            <p className="stat">{inr(card.value)}</p>
            <p className="text-xs muted mt-3">{card.note}</p>
          </div>
        ))}
      </section>
      {!accounts.length && (
        <div className="panel p-5 mb-7 flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h2>Make room for your money.</h2>
            <p className="muted mt-2">
              Start with an account, then add categories and your first
              transaction.
            </p>
          </div>
          <Link className="btn" href="/dashboard/accounts">
            Create an account
            <ArrowRight size={17} />
          </Link>
        </div>
      )}
      {summary.reviewCount > 0 && (
        <div className="panel p-5 mb-6">
          <p>
            {summary.reviewCount} imported movements need classification review.
            Pending movements affect account balances but not income or
            spending. Older imported classifications remain unchanged until you
            review them.
          </p>
          <Link className="underline" href="/dashboard/review">
            Review classifications
          </Link>
        </div>
      )}
      <Reminders userId={user.id} />
      <MonthPicker month={month} action="/dashboard" max={currentMonth(now)} />
      {!valid && (
        <p role="alert" className="error mb-5">
          Invalid chart month. Showing this month.
        </p>
      )}
      <p className="muted mb-6 text-xs">
        The month selector applies to charts. Summary cards and recent
        transactions remain all-time.
      </p>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-6">
        <section className="panel overflow-hidden">
          <div className="p-6 flex justify-between items-center gap-3">
            <h2>Recent transactions</h2>
            <Link
              href="/dashboard/transactions"
              className="text-brand text-xs flex gap-1 items-center"
            >
              View all
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {recent.length ? (
            <div>
              {recent.map((t) => (
                <div
                  key={t.id}
                  className="flex gap-3 items-center px-6 py-4 border-t border-[#d7dcd0]"
                >
                  <span
                    className={`p-3 rounded-xl ${t.type === "INCOME" ? "bg-[#e0eadc] text-brand" : "bg-[#eee4d5] text-[#78552f]"}`}
                  >
                    {t.type === "INCOME" ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{t.description}</p>
                    <p className="muted text-xs mt-1 truncate">
                      {t.category.name} · {t.account.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={t.type === "INCOME" ? "text-brand" : ""}>
                      {t.type === "INCOME" ? "+" : "−"}
                      {inr(t.amount)}
                    </p>
                    <p className="muted text-xs mt-1">
                      {t.date.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="A fresh start."
              description="Your transactions will appear here. Add your first income or expense when you’re ready."
            />
          )}
        </section>
        <section className="panel p-6 min-w-0" aria-label="Expense breakdown">
          <h2>Expense breakdown</h2>
          <p className="muted text-xs mt-2">{monthLabel(month, now)}</p>
          <ExpenseChart
            data={categories
              .filter((c) => monthly[5].categories[c.id])
              .map((c) => ({
                name: c.name,
                amount: monthly[5].categories[c.id],
              }))
              .sort((a, b) => b.amount - a.amount)}
          />
        </section>
      </div>
      <section
        className="panel p-6 min-w-0 mt-6"
        aria-label="Monthly cash flow"
      >
        <h2>Income versus expenses</h2>
        <p className="muted text-xs mt-2 mb-5">
          Six months ending {monthLabel(month, now)} · Asia/Kolkata
        </p>
        <MonthlyChart data={monthly} />
      </section>
      <p className="muted text-xs mt-6">
        Balance = opening balances + income − expenses. Transfers are excluded.
      </p>
    </>
  );
}
