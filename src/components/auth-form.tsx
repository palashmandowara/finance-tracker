"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import { credentialsSchema, registrationSchema } from "@/lib/validation";
export function AuthForm({ register = false }: { register?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = (
      register ? registrationSchema : credentialsSchema
    ).safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (register && values.password !== values.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result = register
        ? await authClient.signUp.email({
            ...parsed.data,
            name: String(values.name).trim(),
          })
        : await authClient.signIn.email(parsed.data);
      if (result.error) {
        setError(
          register
            ? "Could not create your account. Check your details or try signing in."
            : "Could not sign in. Check your email and password.",
        );
      } else {
        router.replace(register ? "/setup" : "/dashboard");
        router.refresh();
      }
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="public-header">
        <Brand />
        <Link href="/" className="underline underline-offset-8">
          Back to home
        </Link>
      </header>
      <main className="auth-layout">
        <aside className="auth-story">
          <h2>
            Good plans start
            <br />
            with a clear picture.
          </h2>
          <p className="muted">
            A quiet place to return to your accounts, your month, and the things
            you’re saving for.
          </p>
          <p className="muted mt-12 border-t border-[#d7dcd0] pt-8">
            Track thoughtfully.
            <br />
            Spend with a little more intention.
          </p>
        </aside>
        <section className="auth-form">
          <h1>{register ? "Start fresh." : "Welcome back."}</h1>
          <p className="muted mt-4 mb-8">
            {register
              ? "Create your Finance Tracker account."
              : "Log in to your Finance Tracker account."}
          </p>
          <form onSubmit={submit} className="grid gap-5" aria-busy={pending}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="e.g. Aarav"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            <div>
              <label htmlFor="password">Password</label>
              <div className="password-field mt-2">
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  maxLength={128}
                  aria-describedby={register ? "password-help" : undefined}
                />
                <button
                  type="button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {register && (
              <>
                <p id="password-help" className="muted text-sm">
                  Use 8–128 characters. A longer, unique password is best.
                </p>
                <label>
                  Confirm password
                  <input
                    name="confirmPassword"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="btn mt-2" disabled={pending}>
              {pending
                ? "Please wait…"
                : register
                  ? "Create account"
                  : "Log in"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="muted text-center mt-7">
            {register ? "Already have an account?" : "New to Finance Tracker?"}{" "}
            <Link
              className="text-brand underline underline-offset-4"
              href={register ? "/login" : "/register"}
            >
              {register ? "Log in" : "Create account"}
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
