import Link from "next/link";
export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="panel p-10 text-center">
        <p className="eyebrow mb-3">404</p>
        <h1>Page not found.</h1>
        <p className="muted my-5">Let’s get you back to your finances.</p>
        <Link className="btn" href="/dashboard">
          Back to overview
        </Link>
      </div>
    </main>
  );
}
