import { Tags } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { CategoryForm } from "@/components/forms";
import { PageHeading, EmptyState } from "@/components/ui";
export default async function Categories() {
  const user = await requireUser();
  const categories = await getDb().category.findMany({
    where: { userId: user.id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return (
    <>
      <PageHeading
        eyebrow="Give your spending some context"
        title="Categories"
        description="Keep income and expenses organised in a way that works for you."
      />
      <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6 items-start">
        <section className="panel p-6">
          {categories.length ? (
            <div className="grid gap-3">
              {categories.map((c) => (
                <div
                  className="flex items-center gap-4 rounded-xl bg-[#eeeee3] p-4"
                  key={c.id}
                >
                  <Tags size={20} className="text-brand shrink-0" />
                  <p className="flex-1 break-words min-w-0">{c.name}</p>
                  <span className="muted text-xs">
                    {c.type === "INCOME" ? "Income" : "Expense"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Make it your own."
              description="Try Food, Travel, and Shopping for expenses, or Salary and Freelance for income. Create at least one category before recording a transaction."
            />
          )}
        </section>
        <section className="panel p-6">
          <h2 className="mb-6">Create a category</h2>
          <CategoryForm />
        </section>
      </div>
    </>
  );
}
