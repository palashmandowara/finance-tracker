import { requireUser } from "@/lib/session";
import { Navigation } from "@/components/navigation";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navigation name={user.name} email={user.email} />
      <main id="main" className="lg:ml-60 p-5 sm:p-8 xl:p-12 max-w-[1700px]">
        {children}
      </main>
    </>
  );
}
