"use client";
export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="panel p-8 max-w-lg">
        <p className="eyebrow mb-3">Finance Tracker</p>
        <h1>We couldn’t load your workspace.</h1>
        <p className="muted mt-5 leading-relaxed">
          Please try again. For a new installation, configure DATABASE_URL,
          BETTER_AUTH_SECRET, and BETTER_AUTH_URL in .env, then run the database
          migrations described in the README.
        </p>
        <button className="btn mt-6" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
