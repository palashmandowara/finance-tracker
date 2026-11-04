import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { Brand } from "@/components/brand";
export const dynamic = "force-dynamic";
export default async function Home() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const action = (
    <Link className="btn" href={session ? "/dashboard" : "/register"}>
      {session ? "Open dashboard" : "Create account"}{" "}
      <span aria-hidden="true">↗</span>
    </Link>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Brand />
        <nav aria-label="Public navigation">
          <a className="section-link" href="#features">
            Features
          </a>
          <a className="section-link" href="#how-it-works">
            How it works
          </a>
          {!session && <Link href="/login">Log in</Link>}
          {action}
        </nav>
      </header>
      <main id="main" className="public-wrap">
        <section className="home-hero">
          <h1>
            A little clarity.
            <br />
            <em>A lot more control.</em>
          </h1>
          <div>
            <p className="muted">
              Make sense of your everyday money. Track expenses, plan your
              month, and make room for what matters.
            </p>
            <div className="flex flex-wrap gap-5 items-center mt-6">
              {action}
              {!session && (
                <Link href="/login" className="underline underline-offset-8">
                  Log in
                </Link>
              )}
            </div>
          </div>
        </section>
        <section className="home-product" aria-label="Product preview">
          <figure>
            <div className="product-frame">
              <div className="product-caption">
                <span>Finance Tracker · Dashboard</span>
                <span>Sample data</span>
              </div>
              <Image
                src="/product-preview.png"
                width={1200}
                height={850}
                alt="Sample dashboard showing a ₹6,500 balance, ₹2,000 income and ₹500 expenses."
                priority
                unoptimized
              />
            </div>
            <figcaption className="muted text-xs mt-4">
              Actual application screenshot · Illustrative sample account, not
              your financial data.
            </figcaption>
          </figure>
          <div>
            <h2 className="text-4xl!">
              Your finances,
              <br />
              in plain sight.
            </h2>
            <p className="muted mt-5 leading-relaxed">
              One considered space for the money you earn, spend and set aside.
            </p>
            <div className="mt-5">
              <div className="feature-row">
                <span>Record</span>
                <span>Accounts & transactions</span>
              </div>
              <div className="feature-row">
                <span>Plan</span>
                <span>Budgets & savings goals</span>
              </div>
              <div className="feature-row">
                <span>Understand</span>
                <span>Charts & comparisons</span>
              </div>
            </div>
            <p className="muted text-xs mt-6">
              Manually tracked. Always in INR.
            </p>
          </div>
        </section>
        <section id="features" className="home-section">
          <h2 className="text-4xl!">
            Know where it goes.
            <br />
            Choose what comes next.
          </h2>
          <div className="feature-grid">
            <article>
              <h2>Track the everyday</h2>
              <p className="muted">
                Add your accounts and record income and expenses in INR. Filter
                by date, category, account or type.
              </p>
            </article>
            <article>
              <h2>Plan your month</h2>
              <p className="muted">
                Set overall and category budgets. See what remains and get a
                clear warning as you approach your limit.
              </p>
            </article>
            <article>
              <h2>See your progress</h2>
              <p className="muted">
                Compare monthly spending, explore charts and allocate savings
                towards your goals.
              </p>
            </article>
          </div>
        </section>
        <section id="how-it-works" className="home-section">
          <h2 className="text-4xl!">A simple start.</h2>
          <ol className="feature-grid list-decimal list-inside">
            <li>
              Create your account.
              <p className="muted mt-3">
                Sign up with your name, email and password.
              </p>
            </li>
            <li>
              Add a financial account.
              <p className="muted mt-3">
                Give it a nickname and starting balance. Tracking is manual.
              </p>
            </li>
            <li>
              Build your money picture.
              <p className="muted mt-3">
                Add transactions, set budgets and keep an eye on your goals.
              </p>
            </li>
          </ol>
        </section>
        <footer className="public-footer">
          <span>Finance Tracker · Personal finance, clearly.</span>
          <span>Manual tracking. No bank connection required.</span>
          <Link href={session ? "/dashboard" : "/login"}>
            {session ? "Open dashboard" : "Log in"}
          </Link>
        </footer>
      </main>
    </>
  );
}
