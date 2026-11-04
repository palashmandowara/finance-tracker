import Link from "next/link";
import { calendarItems } from "@/lib/schedule-data";
import { indiaToday, shiftMonth } from "@/lib/months";
import { inr } from "@/lib/money";
export async function Reminders({ userId }: { userId: string }) {
  const today = indiaToday();
  const items = (
    await calendarItems(
      userId,
      "2000-01-01",
      shiftMonth(today.slice(0, 7), 1) + "-28",
    )
  )
    .filter((e) => e.status !== "Paid" && (!e.subscription || e.date >= today))
    .slice(0, 5);
  return (
    <section className="panel p-6 mt-6" aria-label="Financial reminders">
      <div className="flex justify-between gap-4">
        <h2>Coming up & overdue</h2>
        <Link className="underline" href="/dashboard/calendar">
          Open calendar
        </Link>
      </div>
      {!items.length ? (
        <p className="muted mt-4">
          No pending reminders. Add bills or subscriptions when you’re ready.
        </p>
      ) : (
        items.map((e) => (
          <Link
            key={e.id}
            href={e.href}
            className="flex flex-wrap justify-between gap-3 mt-4 border-t border-[#d7dcd0] pt-4"
          >
            <span>
              {e.title} · {e.date}
            </span>
            <span>
              {inr(e.amount)} · {e.status}
            </span>
          </Link>
        ))
      )}
      <p className="muted text-xs mt-4">
        Reminders only. Nothing is charged or recorded automatically.
      </p>
    </section>
  );
}
