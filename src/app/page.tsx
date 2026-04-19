import ResetDbButton from "./reset-db-button";
import RecentTransactionsTable from "./recent-transactions-table";
import { db } from "@/lib/db";
import { loadMonthlyTrueSpendRows, type MonthlySpendRow } from "@/lib/expense-summary";
import type { Transaction } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

function loadData() {
  const d = db();
  const transactions = d
    .prepare(`SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 100`)
    .all() as Transaction[];
  const monthly = loadMonthlyTrueSpendRows(d);
  const totals = d
    .prepare(
      `SELECT
         COUNT(*) AS total_txns,
         SUM(CASE WHEN reconciled = 1 THEN 1 ELSE 0 END) AS reconciled,
         SUM(CASE WHEN reconciled = 0 AND mine_only = 0 THEN 1 ELSE 0 END) AS pending
       FROM transactions`,
    )
    .get() as { total_txns: number; reconciled: number; pending: number };
  return { transactions, monthly, totals };
}

export default function Dashboard() {
  const { transactions, monthly, totals } = loadData();
  const byMonth = new Map<string, MonthlySpendRow[]>();
  for (const row of monthly) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month)!.push(row);
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm opacity-70 mt-1">
            True personal spend = Splitwise shares + unreconciled credit card +
            unreconciled Venmo outflows. Unmatched CC charges count in full
            until you reconcile them.
          </p>
        </div>
        <ResetDbButton />
      </header>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Transactions" value={totals.total_txns ?? 0} />
        <Stat label="Reconciled" value={totals.reconciled ?? 0} />
        <Stat label="Pending review" value={totals.pending ?? 0} />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Monthly true spend by category</h2>
        {byMonth.size === 0 && (
          <p className="text-sm opacity-60">
            No data yet. Head to <a className="underline" href="/import">Import</a>.
          </p>
        )}
        <div className="space-y-6">
          {Array.from(byMonth.entries()).map(([month, rows]) => {
            const total = rows.reduce((s, r) => s + r.true_spend, 0);
            return (
              <div
                key={month}
                className="border border-black/10 dark:border-white/10 rounded p-4"
              >
                <div className="flex justify-between mb-2">
                  <h3 className="font-medium">{month}</h3>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </div>
                <table className="w-auto min-w-[20rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide opacity-60">
                    <tr>
                      <th className="pb-1 pr-6 font-medium">Expense</th>
                      <th className="pb-1 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.category}
                        className="border-t border-black/5 dark:border-white/5"
                      >
                        <td className="py-1 pr-6">
                          <Link
                            href={{
                              pathname: "/dashboard/category",
                              query: { month, category: r.category },
                            }}
                            className="underline underline-offset-2"
                          >
                            {r.category}
                          </Link>
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                          ${r.true_spend.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Recent transactions</h2>
        <RecentTransactionsTable initialTransactions={transactions} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-black/10 dark:border-white/10 rounded p-4">
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className="text-2xl font-mono mt-1">{value}</div>
    </div>
  );
}
