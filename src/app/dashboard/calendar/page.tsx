import Link from "next/link";
import { requireUser } from "@/lib/session";
import { calendarItems } from "@/lib/schedule-data";
import { currentMonth, shiftMonth, indiaToday } from "@/lib/months";
import { inr } from "@/lib/money";
import { PageHeading } from "@/components/ui";
export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const requested = (await searchParams).month;
  const month =
    requested && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : currentMonth();
  const first = month + "-01",
    next = shiftMonth(month, 1) + "-01";
  const last = new Date(Date.parse(next) - 86400000).toISOString().slice(0, 10);
  const items = await calendarItems(user.id, first, last);
  const offset = new Date(first).getUTCDay();
  const days = Number(last.slice(-2));
  const today = indiaToday();
  const reminders = await calendarItems(
    user.id,
    "2000-01-01",
    shiftMonth(today.slice(0, 7), 1) + "-28",
  );
  const upcoming = reminders
    .filter((e) => e.status !== "Paid" && (!e.subscription || e.date >= today))
    .slice(0, 30);
  return (
    <>
      <PageHeading
        eyebrow="Your financial calendar"
        title={new Date(first).toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })}
        description="Bills and subscription renewals · Asia/Kolkata · in-app reminders only."
      />
      <nav className="flex gap-3 mb-6" aria-label="Calendar months">
        {month > "2000-01" && (
          <Link
            className="btn btn-secondary"
            href={"/dashboard/calendar?month=" + shiftMonth(month, -1)}
          >
            Previous month
          </Link>
        )}
        <Link
          className="btn"
          href={"/dashboard/calendar?month=" + currentMonth()}
        >
          Today
        </Link>
        {month < "2100-12" && (
          <Link
            className="btn btn-secondary"
            href={"/dashboard/calendar?month=" + shiftMonth(month, 1)}
          >
            Next month
          </Link>
        )}
        <Link className="btn btn-secondary" href="/dashboard/bills">
          Manage bills
        </Link>
      </nav>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[800px] border-l border-t border-[#d7dcd0]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              className="p-3 border-r border-b border-[#d7dcd0] font-semibold"
              key={d}
            >
              {d}
            </div>
          ))}
          {Array.from(
            { length: Math.ceil((offset + days) / 7) * 7 },
            (_, i) => {
              const day = i - offset + 1;
              const date = month + "-" + String(day).padStart(2, "0");
              return (
                <div
                  key={i}
                  className={
                    "min-h-32 p-2 border-r border-b border-[#d7dcd0] " +
                    (date === today ? "bg-[#e0eadc]" : "panel rounded-none!")
                  }
                >
                  {day > 0 && day <= days && (
                    <>
                      <p className="font-semibold mb-2">{day}</p>
                      {items
                        .filter((e) => e.date === date)
                        .map((e) => (
                          <Link
                            key={e.id}
                            href={e.href}
                            className="block border-l-2 border-brand pl-2 py-1 mb-2 text-sm"
                          >
                            <strong className="block">{e.title}</strong>
                            <span>{inr(e.amount)}</span>
                            <span className="block muted text-xs">
                              {e.status}
                            </span>
                          </Link>
                        ))}
                    </>
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>
      {!items.length && (
        <p className="muted my-5">No bills or renewals in this month.</p>
      )}
      <section className="mt-8">
        <h2>Upcoming & overdue</h2>
        <p className="muted my-3">
          Unpaid bills and upcoming renewal estimates. Paid items remain in the
          calendar and payment history.
        </p>
        {!upcoming.length && (
          <p className="panel p-5">Nothing due. A little breathing room.</p>
        )}
        {upcoming.map((e) => (
          <Link
            key={e.id}
            href={e.href}
            className="panel p-4 mb-3 flex justify-between gap-4"
          >
            <span>
              {e.title} · {e.date}
            </span>
            <span>
              {inr(e.amount)} · {e.status}
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
