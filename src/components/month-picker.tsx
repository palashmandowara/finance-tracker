export function MonthPicker({
  month,
  action,
  max,
}: {
  month: string;
  action: string;
  max?: string;
}) {
  return (
    <form action={action} className="flex items-end flex-wrap gap-3 mb-6">
      <label>
        Month
        <input
          name="month"
          type="month"
          required
          min="1900-01"
          max={max ?? "9998-12"}
          defaultValue={month}
        />
      </label>
      <button className="btn btn-secondary">Show month</button>
    </form>
  );
}
