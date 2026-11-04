"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel p-8">
      <h1>Something went wrong.</h1>
      <p className="muted my-5">
        We couldn’t load your finances. Try again. If this is your first setup,
        check the database connection and run the migrations in the README.
      </p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
