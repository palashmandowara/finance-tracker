"use client";
import { useActionState } from "react";
import type { Result } from "@/app/actions";
import { saveSubscription, saveBill } from "@/app/schedule-actions";
export function ScheduleAction({
  action,
  children,
  label,
  name,
  confirmText,
}: {
  action: (state: Result, form: FormData) => Promise<Result>;
  children: React.ReactNode;
  label: string;
  name?: string;
  confirmText?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form
      action={submit}
      aria-label={name || label}
      className="grid gap-4"
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="success" role="status">
          Saved successfully.
        </p>
      )}
      <button className="btn justify-self-start" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}
type Option = { id: string; name: string };
export function AccountSelect({
  accounts,
  value = "",
  name = "accountId",
  label = "Account (optional)",
  optional = true,
}: {
  accounts: Option[];
  value?: string;
  name?: string;
  label?: string;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value} required={!optional}>
        <option value="">
          {optional ? "Not specified" : "Choose account"}
        </option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function CategorySelect({
  categories,
  value = "",
  optional = true,
}: {
  categories: Option[];
  value?: string;
  optional?: boolean;
}) {
  return (
    <label>
      Expense category{optional ? " (optional)" : ""}
      <select name="categoryId" defaultValue={value} required={!optional}>
        <option value="">
          {optional ? "Not specified" : "Choose category"}
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function MoneyInput({
  label = "Amount (INR)",
  name = "amount",
  value,
}: {
  label?: string;
  name?: string;
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
      />
    </label>
  );
}
export function SubscriptionForm({
  accounts,
  categories,
  value,
}: {
  accounts: Option[];
  categories: Option[];
  value?: {
    id: string;
    name: string;
    amount: number;
    frequency: string;
    nextRenewal: string;
    accountId: string | null;
    categoryId: string | null;
  };
}) {
  return (
    <ScheduleAction
      action={saveSubscription}
      label={value ? "Save subscription" : "Create subscription"}
    >
      <input type="hidden" name="id" value={value?.id || ""} />
      <label>
        Name
        <input name="name" required maxLength={80} defaultValue={value?.name} />
      </label>
      <MoneyInput value={value?.amount} />
      <label>
        Frequency
        <select name="frequency" defaultValue={value?.frequency || "MONTHLY"}>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </label>
      <label>
        Next renewal date
        <input
          type="date"
          name="nextRenewal"
          required
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={value?.nextRenewal}
        />
      </label>
      <AccountSelect accounts={accounts} value={value?.accountId || ""} />
      <CategorySelect categories={categories} value={value?.categoryId || ""} />
    </ScheduleAction>
  );
}
export function BillForm({
  accounts,
  value,
}: {
  accounts: Option[];
  value?: {
    id: string;
    title: string;
    amount: number;
    kind: string;
    recurrence: string;
    startDate: string;
    accountId: string | null;
  };
}) {
  return (
    <ScheduleAction
      action={saveBill}
      label={value ? "Save bill schedule" : "Create bill"}
    >
      <input type="hidden" name="id" value={value?.id || ""} />
      <label>
        Title
        <input
          name="title"
          required
          maxLength={80}
          defaultValue={value?.title}
        />
      </label>
      <MoneyInput label="Amount due (INR)" value={value?.amount} />
      <label>
        Bill type
        <select name="kind" defaultValue={value?.kind || "OTHER"}>
          <option value="CREDIT_CARD">Credit-card statement</option>
          <option value="RENT">Rent</option>
          <option value="EMI">EMI</option>
          <option value="UTILITY">Utility</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label>
        First due date
        <input
          name="startDate"
          type="date"
          required
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={value?.startDate}
        />
      </label>
      <label>
        Recurrence
        <select name="recurrence" defaultValue={value?.recurrence || "ONCE"}>
          <option value="ONCE">One-off</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </label>
      <AccountSelect accounts={accounts} value={value?.accountId || ""} />
      <p className="muted text-sm">
        For a credit-card bill, select the card and enter its statement amount
        and due date manually. Current card debt is not the statement balance.
        Schedule edits change future unpaid occurrences; paid and overdue
        history is preserved.
      </p>
    </ScheduleAction>
  );
}
