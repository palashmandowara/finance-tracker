import { Wallet } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { inr, balance } from "@/lib/money";
import { AccountForm } from "@/components/forms";
import { PageHeading, EmptyState } from "@/components/ui";
const labels = {
  BANK: "Bank account",
  CASH: "Cash",
  WALLET: "Digital wallet",
  CREDIT_CARD: "Credit card",
};
export default async function Accounts() {
  const user = await requireUser();
  const [accounts, grouped, transfers, statements] = await Promise.all([
    getDb().financialAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    getDb().transaction.groupBy({
      by: ["accountId", "type"],
      where: { userId: user.id },
      _sum: { amount: true },
    }),
    getDb().transfer.findMany({ where: { userId: user.id } }),
    getDb().importBatch.findMany({
      where: { userId: user.id, data: { path: ["format"], equals: "SLICE" } },
      orderBy: { createdAt: "desc" },
      select: { data: true, result: true },
    }),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="A place for every rupee"
        title="Your accounts"
        description="Bank, cash, or wallet. See your balances in one place."
      />
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <section className="grid sm:grid-cols-2 gap-4">
          {accounts.length ? (
            accounts.map((a) => {
              const income =
                grouped.find((g) => g.accountId === a.id && g.type === "INCOME")
                  ?._sum.amount ?? 0;
              const expense =
                grouped.find(
                  (g) => g.accountId === a.id && g.type === "EXPENSE",
                )?._sum.amount ?? 0;
              const statement = statements.find(
                (s) => (s.data as { accountId?: string }).accountId === a.id,
              )?.result as
                | {
                    statementClosing: number;
                    trackedBalance?: number;
                    reconciledClosing?: number;
                    skipped?: number;
                    closingDate: string;
                  }
                | undefined;
              return (
                <article className="panel p-6" key={a.id}>
                  <Wallet className="text-brand mb-6" size={25} />
                  <p className="muted text-xs mb-2">{labels[a.type]}</p>
                  <h2 className="break-words">{a.name}</h2>
                  <p className="stat mt-5">
                    {inr(
                      balance(a.openingBalance, income, expense) +
                        transfers.reduce(
                          (sum, t) =>
                            sum +
                            (t.toId === a.id ? t.amount : 0) -
                            (t.fromId === a.id ? t.amount : 0),
                          0,
                        ),
                    )}
                  </p>
                  <p className="muted text-xs mt-3">
                    Opening balance {inr(a.openingBalance)}
                  </p>
                  {statement &&
                    statement.reconciledClosing === undefined &&
                    statement.trackedBalance !== undefined &&
                    statement.trackedBalance !== statement.statementClosing && (
                      <p role="alert" className="error mt-4 text-xs">
                        This import reported a balance mismatch with{" "}
                        {statement.skipped ?? 0} skipped rows. Re-upload the
                        original statement for reconciliation. Do not change the
                        opening balance to hide missing transactions.
                      </p>
                    )}
                  {statement && (
                    <div className="mt-4 pt-4 border-t border-[#d7dcd0] text-xs muted">
                      <p>
                        Latest imported statement closed at{" "}
                        {inr(statement.statementClosing)} on{" "}
                        {statement.closingDate}.
                      </p>
                      <p className="mt-2">
                        The tracked balance above includes all saved activity.
                        Different dates, missing periods, skipped rows or
                        opening balances can explain differences.
                      </p>
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <div className="panel sm:col-span-2">
              <EmptyState
                title="Your first account starts here."
                description="Add a bank account, cash balance, or wallet. Use the balance before the period you will track or import."
              />
            </div>
          )}
        </section>
        <section className="panel p-6">
          <h2 className="mb-6">Create an account</h2>
          <AccountForm />
        </section>
      </div>
    </>
  );
}
