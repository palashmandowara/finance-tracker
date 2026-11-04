import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { Brand } from "@/components/brand";
import { AccountForm } from "@/components/forms";
export default async function Setup() {
  const user = await requireUser();
  if (await getDb().financialAccount.count({ where: { userId: user.id } }))
    redirect("/dashboard");
  return (
    <>
      <header className="public-header">
        <Brand />
        <Link href="/dashboard">Skip for now</Link>
      </header>
      <main className="max-w-xl mx-auto px-6 py-12">
        <p className="eyebrow mb-4">A simple start · INR</p>
        <h1>A place for your money.</h1>
        <p className="muted mt-4 mb-8 leading-relaxed">
          Create your first manually tracked financial account. Use a nickname,
          such as Everyday account. We never need bank passwords, OTPs or full
          account numbers.
        </p>
        <section className="panel p-6">
          <p className="muted mb-6">
            Currency: INR (₹). Add the balance you’re starting with.
          </p>
          <AccountForm setup />
        </section>
        <p className="muted text-sm mt-6">
          You can skip this step and add an account later from Accounts or
          Settings.
        </p>
      </main>
    </>
  );
}
