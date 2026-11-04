"use client";
import { useActionState } from "react";
import { saveTransfer, deleteTransfer } from "@/app/statement-actions";
import { transferSchema } from "@/lib/statements";
import type { Result } from "@/app/actions";
export function TransferForm({
  accounts,
}: {
  accounts: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    async (s: Result, f: FormData): Promise<Result> => {
      const p = transferSchema.safeParse(Object.fromEntries(f));
      return p.success
        ? saveTransfer(s, f)
        : { error: p.error.issues[0].message };
    },
    {},
  );
  return (
    <form action={action} className="grid gap-5" aria-label="New transfer">
      <h2>Move money</h2>
      {["fromId", "toId"].map((name, i) => (
        <label key={name}>
          {i ? "To account" : "From account"}
          <select name={name} required defaultValue="">
            <option value="">Choose account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Amount (INR)
        <input name="amount" required inputMode="decimal" />
      </label>
      <label>
        Date
        <input name="date" type="date" required />
      </label>
      <label>
        Description
        <input
          name="description"
          required
          maxLength={160}
          placeholder="e.g. Card repayment"
        />
      </label>
      <label>
        Reference (optional)
        <input name="reference" maxLength={120} />
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="success" role="status">
          Transfer saved.
        </p>
      )}
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : "Save transfer"}
      </button>
    </form>
  );
}
export function DeleteTransfer({ id }: { id: string }) {
  const [s, a, p] = useActionState(deleteTransfer, {});
  return (
    <form
      action={a}
      onSubmit={(e) => {
        if (!confirm("Delete this linked transfer from both accounts?"))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-secondary" disabled={p}>
        Delete transfer
      </button>
      {s.error && (
        <p role="alert" className="error">
          {s.error}
        </p>
      )}
    </form>
  );
}
