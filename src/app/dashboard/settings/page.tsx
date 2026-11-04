import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { ProfileForm } from "@/components/profile-form";
import { PageHeading } from "@/components/ui";
export default async function Settings() {
  const user = await requireUser();
  const hasAccount = await getDb().financialAccount.count({
    where: { userId: user.id },
  });
  return (
    <>
      <PageHeading
        eyebrow="Your account"
        title="Profile & settings"
        description="A few details that make this space yours."
      />
      <section className="panel p-6 max-w-2xl">
        <h2 className="mb-6">Personal details</h2>
        <p className="muted mb-2">Email address</p>
        <p className="mb-8 break-all">{user.email}</p>
        <ProfileForm name={user.name} />
      </section>
      <section className="max-w-2xl mt-8">
        <h2>Financial accounts</h2>
        <p className="muted mt-3 mb-5">
          Your accounts are manually tracked in INR. No bank connection is
          needed.
        </p>
        <Link
          className="btn btn-secondary"
          href={hasAccount ? "/dashboard/accounts" : "/setup"}
        >
          {hasAccount ? "Manage accounts" : "Complete account setup"}
        </Link>
        <p className="muted mt-8">
          To end your session, use Log out beside your profile in the
          navigation.
        </p>
      </section>
    </>
  );
}
