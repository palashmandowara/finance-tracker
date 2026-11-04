"use client";
import { useActionState } from "react";
import { applyClassificationPlan } from "@/app/classification-plan-actions";
export function ConfirmClassificationPlan({ digest }: { digest: string }) {
  const [state, action, pending] = useActionState(applyClassificationPlan, {});
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="digest" value={digest} />
      <button className="btn" disabled={pending}>
        {pending ? "Applying…" : "Confirm reviewed classifications"}
      </button>
      {state.error && (
        <p role="alert" className="error mt-3">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status">
          Reviewed classifications applied. Cash balances and original records
          were preserved.
        </p>
      )}
    </form>
  );
}
