"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import {
  saveAccount,
  saveCategory,
  saveTransaction,
  deleteTransaction,
  type Result,
} from "@/app/actions";
import {
  accountSchema,
  categorySchema,
  transactionSchema,
} from "@/lib/validation";
import type { z } from "zod";
type Option = { id: string; name: string };
type Category = Option & { type: "INCOME" | "EXPENSE" };
export type EditableTransaction = {
  id: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  date: string;
  accountId: string;
  categoryId: string;
};
function validated(
  schema: z.ZodType,
  action: (state: Result, form: FormData) => Promise<Result>,
) {
  return async (state: Result, form: FormData): Promise<Result> => {
    const result = schema.safeParse(Object.fromEntries(form));
    return result.success
      ? action(state, form)
      : { error: result.error.issues[0].message };
  };
}
function Feedback({ state }: { state: Result }) {
  return (
    <>
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
    </>
  );
}
export function AccountForm({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    validated(accountSchema, saveAccount),
    {},
  );
  useEffect(() => {
    if (setup && state.success) {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [setup, state.success, router]);
  return (
    <form action={action} className="grid gap-5">
      <label>
        Account name
        <input
          name="name"
          required
          maxLength={60}
          placeholder="e.g. Main bank account"
        />
      </label>
      <label>
        Account type
        <select name="type">
          <option value="BANK">Bank account</option>
          <option value="CASH">Cash</option>
          <option value="WALLET">Digital wallet</option>
          <option value="CREDIT_CARD">Credit card</option>
        </select>
      </label>
      <label>
        Opening balance (₹)
        <input
          name="openingBalance"
          inputMode="decimal"
          required
          defaultValue="0"
          pattern="-?[0-9]{1,8}(\.[0-9]{1,2})?"
        />
      </label>
      <p className="muted text-xs leading-relaxed">
        The balance before you start tracking or importing. It should precede
        the imported period; do not use a statement closing balance. For a
        credit card, enter money owed as a negative amount. Opening balances are
        not income.
      </p>
      <Feedback state={state} />
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : "Create account"}
        <Plus size={17} />
      </button>
    </form>
  );
}
export function CategoryForm() {
  const [state, action, pending] = useActionState(
    validated(categorySchema, saveCategory),
    {},
  );
  return (
    <form action={action} className="grid gap-5">
      <label>
        Category name
        <input
          name="name"
          required
          maxLength={40}
          placeholder="e.g. Food & drinks"
        />
      </label>
      <label>
        Transaction type
        <select name="type">
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
      </label>
      <Feedback state={state} />
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : "Create category"}
        <Plus size={17} />
      </button>
    </form>
  );
}
export function TransactionButton({
  accounts,
  categories,
  transaction,
}: {
  accounts: Option[];
  categories: Category[];
  transaction?: EditableTransaction;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  return (
    <>
      <button
        className={transaction ? "btn btn-secondary text-xs" : "btn"}
        aria-label={transaction ? `Edit ${transaction.description}` : undefined}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {transaction ? <Pencil size={14} /> : <Plus size={18} />}
        {transaction ? "Edit" : "Add transaction"}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby={`transaction-title-${transaction?.id ?? "new"}`}
      >
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 id={`transaction-title-${transaction?.id ?? "new"}`}>
            {transaction ? "Edit transaction" : "New transaction"}
          </h2>
          <button aria-label="Close dialog" className="p-2" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {open && (
          <TransactionForm
            accounts={accounts}
            categories={categories}
            transaction={transaction}
            close={close}
          />
        )}
      </dialog>
    </>
  );
}
function TransactionForm({
  accounts,
  categories,
  transaction,
  close,
}: {
  accounts: Option[];
  categories: Category[];
  transaction?: EditableTransaction;
  close: () => void;
}) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">(
    transaction?.type ?? "EXPENSE",
  );
  const [state, action, pending] = useActionState(
    validated(transactionSchema, saveTransaction),
    {},
  );
  useEffect(() => {
    if (state.success) close();
  }, [state.success, close]);
  const available = categories.filter((c) => c.type === type);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <form action={action} className="grid gap-5">
      {transaction && <input type="hidden" name="id" value={transaction.id} />}
      <label>
        Type
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
      </label>
      <label>
        Description
        <input
          name="description"
          required
          maxLength={500}
          defaultValue={transaction?.description}
          placeholder="What was this for?"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label>
          Amount (₹)
          <input
            name="amount"
            required
            inputMode="decimal"
            pattern="[0-9]{1,8}(\.[0-9]{1,2})?"
            placeholder="0.00"
            defaultValue={
              transaction ? (transaction.amount / 100).toFixed(2) : undefined
            }
          />
        </label>
        <label>
          Date
          <input
            name="date"
            type="date"
            required
            min="1900-01-01"
            max="9999-12-31"
            defaultValue={transaction?.date ?? today}
          />
        </label>
      </div>
      <label>
        Account
        <select
          name="accountId"
          required
          defaultValue={transaction?.accountId ?? ""}
        >
          <option value="" disabled>
            Choose an account
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select
          key={type}
          name="categoryId"
          required
          defaultValue={
            transaction?.type === type ? transaction.categoryId : ""
          }
        >
          <option value="" disabled>
            Choose a category
          </option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {(!accounts.length || !available.length) && (
        <p className="error">
          Create an account and a {type.toLowerCase()} category first using the
          sidebar.
        </p>
      )}
      <p className="muted text-xs">
        Record only income or expenses here. Transfers and credit-card
        repayments belong in Transfers & card repayments, not in this
        income/expense form.
      </p>
      <Feedback state={state} />
      <button
        className="btn"
        disabled={pending || !accounts.length || !available.length}
      >
        {pending ? "Saving…" : transaction ? "Save changes" : "Add transaction"}
      </button>
    </form>
  );
}
export function DeleteButton({
  id,
  description,
}: {
  id: string;
  description: string;
}) {
  const [state, action, pending] = useActionState(deleteTransaction, {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${description}”? This cannot be undone.`))
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        className="p-3 rounded-full hover:bg-red-100 text-[#9c3333]"
        aria-label={`Delete ${description}`}
        disabled={pending}
      >
        <Trash2 size={17} />
      </button>
      {state.error && (
        <p role="alert" className="error text-xs">
          {state.error}
        </p>
      )}
    </form>
  );
}
