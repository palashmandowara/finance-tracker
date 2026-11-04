"use client";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { inr } from "@/lib/money";
const colors = [
  "#24563b",
  "#537461",
  "#46aba8",
  "#ae7844",
  "#a4a0e8",
  "#ee9c9c",
];
const tooltipStyle = {
  background: "#fcfaf4",
  border: "1px solid #b8c4b8",
  borderRadius: 10,
  color: "#172e23",
};
export function ExpenseChart({
  data,
}: {
  data: { name: string; amount: number }[];
}) {
  if (!data.length)
    return (
      <p className="muted py-16 text-center">
        No expenses in this month yet. Add an expense to see your breakdown.
      </p>
    );
  return (
    <>
      <div
        className="h-64 min-w-0"
        role="img"
        aria-label="Expense breakdown chart. Exact figures are listed below."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={data.filter((d) => d.amount > 0)}
              dataKey="amount"
              nameKey="name"
              innerRadius={60}
              outerRadius={95}
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name + index}
                  fill={colors[index % colors.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => inr(Number(value ?? 0))}
              contentStyle={tooltipStyle}
              itemStyle={{ color: "white" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {data.some((d) => d.amount < 0) && (
        <p className="muted text-sm mb-3">
          Reversals offset spending on their credit date. Negative category
          totals are listed below and excluded from the pie.
        </p>
      )}
      <ul className="grid gap-3" aria-label="Expense chart values">
        {data.map((d, i) => (
          <li key={d.name + i} className="flex gap-3 justify-between">
            <span className="min-w-0 break-words">
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ background: colors[i % colors.length] }}
              />
              {d.name}
            </span>
            <span className="shrink-0">{inr(d.amount)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
export function MonthlyChart({
  data,
}: {
  data: { label: string; income: number; expense: number }[];
}) {
  if (!data.some((d) => d.income || d.expense))
    return (
      <p className="muted py-16 text-center">
        No income or expenses in these six months yet. Your monthly chart will
        grow with your records.
      </p>
    );
  return (
    <>
      <div
        className="h-72 min-w-0"
        role="img"
        aria-label="Monthly income versus expenses chart. Exact figures are available below."
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 8, left: 0, bottom: 8 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="#d7dcd0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#536b5b", fontSize: 10 }}
              tickFormatter={(value) => String(value).split(" ·")[0]}
            />
            <YAxis
              tick={{ fill: "#536b5b", fontSize: 10 }}
              tickFormatter={(value) => `₹${Number(value) / 100}`}
              width={75}
            />
            <Tooltip
              formatter={(value) => inr(Number(value ?? 0))}
              contentStyle={tooltipStyle}
            />
            <Legend />
            <Bar
              dataKey="income"
              name="Income"
              fill="#24563b"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expense"
              name="Expenses"
              fill="#ae7844"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-4">
        <summary className="muted">View monthly chart values</summary>
        <div className="overflow-x-auto">
          <table aria-label="Monthly chart values">
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td>{inr(d.income)}</td>
                  <td>{inr(d.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
