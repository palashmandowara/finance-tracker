"use client";
import { useActionState } from "react";
import { updateProfile } from "@/app/profile-actions";
import { profileSchema } from "@/lib/validation";
import type { Result } from "@/app/actions";
export function ProfileForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(
    async (state: Result, form: FormData): Promise<Result> => {
      const parsed = profileSchema.safeParse(Object.fromEntries(form));
      return parsed.success
        ? updateProfile(state, form)
        : { error: parsed.error.issues[0].message };
    },
    {},
  );
  return (
    <form action={action} className="grid gap-5">
      <label>
        Your name
        <input
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          autoComplete="name"
        />
      </label>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="success" role="status">
          Your name has been updated.
        </p>
      )}
      <button className="btn justify-self-start" disabled={pending}>
        {pending ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
