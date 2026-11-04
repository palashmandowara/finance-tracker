import Link from "next/link";
import { ArrowUpRight, ReceiptText } from "lucide-react";
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 mb-8">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted mt-3">{description}</p>
      </div>
      {children}
    </header>
  );
}
export function EmptyState({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="text-center px-6 py-14">
      <span className="inline-flex p-4 rounded-2xl bg-[#e0eadc] text-brand mb-5">
        <ReceiptText size={26} />
      </span>
      <h2>{title}</h2>
      <p className="muted mt-3 max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {href && (
        <Link href={href} className="btn btn-secondary mt-6">
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
