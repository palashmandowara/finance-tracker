import type { Recognition } from "@/lib/recognition";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { filtersSchema } from "@/lib/validation";
import { transactionWhere } from "@/lib/transaction-filters";
import { csv } from "@/lib/statements";
export async function GET(request: Request) {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const parsed = filtersSchema.safeParse(
    Object.fromEntries(
      ["from", "to", "account", "category", "type"].map((k) => [
        k,
        params.get(k) || undefined,
      ]),
    ),
  );
  if (!parsed.success) return new Response("Invalid filters", { status: 400 });
  const rows = await getDb().transaction.findMany({
    where: transactionWhere(user.id, parsed.data),
    include: { account: true, category: true },
    orderBy: [
      { date: "desc" },
      { sourceOrder: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
  return new Response(
    csv([
      ["Date", "Account", "Type", "Category", "Description", "Amount (INR)"],
      ...rows.map((t) => [
        t.date.toISOString().slice(0, 10),
        t.account.name,
        t.reversalOfId
          ? "REVERSAL"
          : t.classification
            ? (t.classification as unknown as Recognition).kind
            : t.type,
        t.category.name,
        t.description,
        (t.amount / 100).toFixed(2),
      ]),
    ]),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="finance-tracker-transactions.csv"',
        "Cache-Control": "private, no-store",
      },
    },
  );
}
