"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AudioLines,
  Settings,
  CalendarDays,
  Repeat,
  Receipt,
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tags,
  LogOut,
  Gauge,
  Target,
  ChartNoAxesCombined,
} from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  {
    href: "/dashboard/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
  },
  { href: "/dashboard/accounts", label: "Accounts", icon: Wallet },
  { href: "/dashboard/categories", label: "Categories", icon: Tags },
  { href: "/dashboard/budgets", label: "Budgets", icon: Gauge },
  { href: "/dashboard/goals", label: "Savings goals", icon: Target },
  {
    href: "/dashboard/comparisons",
    label: "Comparisons",
    icon: ChartNoAxesCombined,
  },
  { href: "/dashboard/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/dashboard/bills", label: "Bills", icon: Receipt },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];
export function Navigation({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <aside className="lg:fixed lg:inset-y-0 lg:w-60 lg:overflow-y-auto bg-[#eeeee3] border-b lg:border-r border-[#d7dcd0] flex flex-col p-4 lg:p-6 z-10">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 font-bold text-base whitespace-nowrap py-3"
      >
        <span className="bg-brand text-white rounded-full p-1.5">
          <AudioLines size={22} />
        </span>
        Finance Tracker
      </Link>
      <p className="eyebrow mt-12 mb-4 px-3 hidden lg:block">Your workspace</p>
      <nav
        aria-label="Main navigation"
        className="grid grid-cols-4 lg:flex lg:flex-col gap-1 mt-3 lg:mt-0"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`flex flex-col lg:flex-row items-center gap-2 lg:gap-3 rounded-xl px-2 lg:px-3 py-3 text-[11px] sm:text-sm ${pathname === href ? "bg-[#e0eadc] text-brand" : "text-[#536b5b] hover:bg-[#e0e6d8]"}`}
          >
            <Icon size={19} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8 hidden lg:block">
        <div className="panel p-4 mb-6">
          <div className="h-2 w-2 rounded-full bg-brand mb-3" />
          <p className="font-semibold">Small steps add up.</p>
          <p className="muted text-xs leading-relaxed mt-2">
            A daily check-in makes your money easier to understand.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 lg:mt-0 border-t border-[#d7dcd0] pt-4">
        <span className="rounded-full bg-[#dce7d8] text-brand w-9 h-9 flex items-center justify-center shrink-0 font-bold">
          {name[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="text-xs muted truncate">{email}</p>
        </div>
        <button
          aria-label="Log out"
          title="Log out"
          disabled={busy}
          className="p-3 rounded-lg hover:bg-[#dce7d8]"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await authClient.signOut();
              if (result.error) throw new Error();
              router.replace("/login");
              router.refresh();
            } catch {
              setError("Logout failed. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
      {error && (
        <p role="alert" className="error mt-2">
          {error}
        </p>
      )}
    </aside>
  );
}
