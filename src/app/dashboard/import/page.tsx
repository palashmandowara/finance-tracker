import { requireUser } from "@/lib/session";
import { options } from "@/lib/queries";
import { PageHeading } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
export default async function ImportPage() {
  const user = await requireUser();
  const { accounts, categories } = await options(user.id);
  return (
    <>
      <PageHeading
        eyebrow="Bring your records together"
        title="Import a statement"
        description="Upload, review, then confirm. Your records stay in your control."
      />
      <ImportWizard
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        }))}
      />
    </>
  );
}
