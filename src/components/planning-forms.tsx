"use client";
import { useActionState } from "react";
import type { z } from "zod";
import type { Result } from "@/app/actions";
import {
  saveBudget,
  saveGoal,
  deleteGoal,
  addContribution,
  removeContribution,
} from "@/app/planning-actions";
import {
  budgetSchema,
  goalSchema,
  contributionSchema,
} from "@/lib/planning-validation";
function validated(
  schema: z.ZodType,
  action: (state: Result, form: FormData) => Promise<Result>,
) {
  return async (state: Result, form: FormData): Promise<Result> => {
    const parsed = schema.safeParse(Object.fromEntries(form));
    return parsed.success
      ? action(state, form)
      : { error: parsed.error.issues[0].message };
  };
}
function Feedback({ state }: { state: Result }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="success">
          Saved successfully.
        </p>
      )}
    </>
  );
}
function Amount({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        required
        inputMode="decimal"
        pattern="[0-9]{1,8}(\.[0-9]{1,2})?"
        defaultValue={
          value === undefined ? undefined : (value / 100).toFixed(2)
        }
        placeholder="0.00"
      />
    </label>
  );
}
export function BudgetForm({
  month,
  categories,
  budget,
}: {
  month: string;
  categories: { id: string; name: string }[];
  budget?: { id: string; categoryId: string | null; amount: number };
}) {
  const [state, action, pending] = useActionState(
    validated(budgetSchema, saveBudget),
    {},
  );
  return (
    <form
      action={action}
      className="grid gap-4"
      aria-label={budget ? "Edit budget" : "Set budget"}
    >
      {budget && <input type="hidden" name="id" value={budget.id} />}
      <input type="hidden" name="month" value={month} />
      {budget ? (
        <input
          type="hidden"
          name="categoryId"
          value={budget.categoryId ?? ""}
        />
      ) : (
        <label>
          Budget scope
          <select name="categoryId" defaultValue="">
            <option value="">Overall expenses</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Amount name="amount" label="Monthly limit (₹)" value={budget?.amount} />
      <Feedback state={state} />
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : budget ? "Save budget" : "Set budget"}
      </button>
    </form>
  );
}
export function GoalForm({
  goal,
}: {
  goal?: { id: string; name: string; target: number; deadline: string };
}) {
  const [state, action, pending] = useActionState(
    validated(goalSchema, saveGoal),
    {},
  );
  return (
    <form
      action={action}
      className="grid gap-4"
      aria-label={goal ? "Edit goal" : "Create goal"}
    >
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <label>
        Goal name
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={goal?.name}
          placeholder="e.g. Emergency fund"
        />
      </label>
      <Amount name="target" label="Target amount (₹)" value={goal?.target} />
      <label>
        Deadline (optional)
        <input
          name="deadline"
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          defaultValue={goal?.deadline}
        />
      </label>
      <Feedback state={state} />
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : goal ? "Save goal" : "Create goal"}
      </button>
    </form>
  );
}
export function ContributionForm({ goalId }: { goalId: string }) {
  const [state, action, pending] = useActionState(
    validated(contributionSchema, addContribution),
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="goalId" value={goalId} />
      <Amount name="amount" label="Allocation amount (₹)" />
      <Feedback state={state} />
      <button className="btn btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Add allocation"}
      </button>
    </form>
  );
}
export function RemovePlanningRecord({
  id,
  goal = false,
}: {
  id: string;
  goal?: boolean;
}) {
  const [state, action, pending] = useActionState(
    goal ? deleteGoal : removeContribution,
    {},
  );
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            goal
              ? "Delete this goal and its allocations? Your financial transactions will not change."
              : "Remove this allocation? Your financial transactions will not change.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-secondary text-xs" disabled={pending}>
        {goal ? "Delete goal" : "Remove allocation"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
