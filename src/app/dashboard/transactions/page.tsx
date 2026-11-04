import Link from "next/link";
import { ClassificationReview } from "@/components/classification-review";
import { recognise, type Recognition } from "@/lib/recognition";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { options } from "@/lib/queries";
import { inr } from "@/lib/money";
import { filtersSchema } from "@/lib/validation";
import { PageHeading, EmptyState } from "@/components/ui";
import { TransactionButton, DeleteButton } from "@/components/forms";
import { transactionWhere } from "@/lib/transaction-filters";
export default async function Transactions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filterValues = Object.fromEntries(
    ["from", "to", "category", "account", "type"].map((k) => [
      k,
      params[k] || undefined,
    ]),
  );
  const parsed = filtersSchema.safeParse(filterValues);
  const filters = parsed.success ? parsed.data : {};
  const pageValue = typeof params.page === "string" ? Number(params.page) : 1;
  const requestedPage =
    Number.isInteger(pageValue) && pageValue > 0
      ? Math.min(pageValue, 100000)
      : 1;
  const where = transactionWhere(user.id, filters);
  const [{ accounts, categories }, count] = await Promise.all([
    options(user.id),
    getDb().transaction.count({ where }),
  ]);
  const learned = await getDb().merchantClassification.findMany({
    where: { userId: user.id },
  });
  const rules = await getDb().merchantRule.findMany({
    where: { userId: user.id },
  });
  const pages = Math.max(1, Math.ceil(count / 20));
  const page = Math.min(requestedPage, pages);
  const rows = await getDb().transaction.findMany({
    where,
    include: { account: true, category: true, sliceEntries: true },
    orderBy: [
      { date: "desc" },
      { sourceOrder: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: 20,
    skip: (page - 1) * 20,
  });
  function pageUrl(n: number) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);
    query.set("page", String(n));
    return `/dashboard/transactions?${query}`;
  }
  return (
    <>
      <PageHeading
        eyebrow="Every little detail"
        title="Transactions"
        description="Track what comes in and what goes out."
      >
        <TransactionButton accounts={accounts} categories={categories} />
      </PageHeading>
      <div className="flex flex-wrap gap-3 mb-6">
        <a
          className="btn btn-secondary"
          href={
            "/dashboard/transactions/export?" +
            new URLSearchParams(
              Object.entries(filters).filter(([, v]) => Boolean(v)) as [
                string,
                string,
              ][],
            ).toString()
          }
        >
          Export CSV
        </a>
        <Link className="btn btn-secondary" href="/dashboard/review">
          Review imported classifications
        </Link>
        <Link className="btn btn-secondary" href="/dashboard/import">
          Import statement
        </Link>
        <Link className="btn btn-secondary" href="/dashboard/transfers">
          Transfers & card repayments
        </Link>
      </div>
      <form
        className="panel p-5 grid sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6"
        action="/dashboard/transactions"
      >
        <label>
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            min="1900-01-01"
            max="9999-12-31"
          />
        </label>
        <label>
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            min={filters.from ?? "1900-01-01"}
            max="9999-12-31"
          />
        </label>
        <label>
          Account
          <select name="account" defaultValue={filters.account ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name} ({c.type.toLowerCase()})
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select name="type" defaultValue={filters.type ?? ""}>
            <option value="">All types</option>
            <option value="INCOME">Credit / money in</option>
            <option value="EXPENSE">Debit / money out</option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button className="btn btn-secondary">Apply</button>
          <Link href="/dashboard/transactions" className="muted underline py-3">
            Reset
          </Link>
        </div>
      </form>
      {!parsed.success && (
        <p className="error mb-5" role="alert">
          Invalid filters: {parsed.error.issues[0].message} Showing all
          transactions.
        </p>
      )}
      <section className="panel overflow-hidden">
        <div className="p-6 flex justify-between items-center">
          <h2>Your activity</h2>
          <span className="muted text-xs">
            {count} transaction{count === 1 ? "" : "s"}
          </span>
        </div>
        {rows.length ? (
          <div className="relative overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <p className="font-medium min-w-36 max-w-72 break-words">
                        {t.description}
                      </p>
                      <p className="muted text-xs mt-1">
                        {t.classification
                          ? (t.classification as unknown as Recognition)
                              .merchant + " · "
                          : ""}
                        {t.category.name} ·{" "}
                        {t.reversalOfId
                          ? "reversal / spending offset"
                          : t.classification
                            ? (t.classification as unknown as Recognition).kind
                                .replaceAll("_", " ")
                                .toLowerCase()
                            : t.type.toLowerCase()}
                      </p>
                      {t.sliceEntries.length > 0 && (
                        <>
                          <p className="muted text-xs">
                            {t.type === "EXPENSE" ? "Debit" : "Credit"} ·
                            Statement balance {inr(t.sliceEntries[0].balance)} ·{" "}
                            {t.accountingEffect === "NEUTRAL" && !t.reversalOfId
                              ? "Pending / non-income movement"
                              : t.classification
                                ? (t.classification as unknown as Recognition)
                                    .kind
                                : "Legacy classification — review suggested"}
                          </p>
                          <ClassificationReview
                            id={t.id}
                            recognition={
                              (t.classification as unknown as Recognition) ??
                              recognise(
                                t.description,
                                t.type,
                                "",
                                learned,
                                rules,
                              )
                            }
                            categoryId={t.categoryId}
                            type={t.type}
                            categories={categories}
                            accounts={accounts.filter(
                              (a) => a.id !== t.accountId,
                            )}
                          />
                        </>
                      )}
                    </td>
                    <td className="muted whitespace-nowrap">
                      {t.date.toLocaleDateString("en-IN", { timeZone: "UTC" })}
                    </td>
                    <td className="muted">{t.account.name}</td>
                    <td
                      className={`whitespace-nowrap font-medium ${t.type === "INCOME" ? "text-brand" : ""}`}
                    >
                      {t.type === "INCOME" ? "+" : "−"}
                      {inr(t.amount)}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <TransactionButton
                          accounts={accounts}
                          categories={categories}
                          transaction={{
                            id: t.id,
                            amount: t.amount,
                            description: t.description,
                            type: t.type,
                            accountId: t.accountId,
                            categoryId: t.categoryId,
                            date: t.date.toISOString().slice(0, 10),
                          }}
                        />
                        <DeleteButton id={t.id} description={t.description} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              Object.values(filters).some(Boolean)
                ? "No matches this time."
                : "Your story starts with one transaction."
            }
            description={
              Object.values(filters).some(Boolean)
                ? "Try a different date range or clear your filters."
                : "Add an account and category, then record your first income or expense."
            }
          />
        )}
      </section>
      {pages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between mt-5"
        >
          {page > 1 ? (
            <Link className="btn btn-secondary" href={pageUrl(page - 1)}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="btn btn-secondary" href={pageUrl(page + 1)}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
