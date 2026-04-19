import { db } from "@/lib/db";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

type MonthlyRow = { month: string; category: string; true_spend: number };

function loadData() {
  const d = db();
  const transactions = d
    .prepare(`SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 100`)
    .all() as Transaction[];
  const monthly = d
    .prepare(
      `SELECT
         substr(date, 1, 7) AS month,
         COALESCE(category, 'Uncategorized') AS category,
         SUM(
           CASE
             WHEN source = 'splitwise' THEN amount_my_share
             WHEN source = 'credit_card' AND reconciled = 0 THEN amount_my_share
             WHEN source = 'venmo' AND reconciled = 0 AND payer = 'me' THEN amount_my_share
             ELSE 0
           END
         ) AS true_spend
       FROM transactions
       GROUP BY month, category
       HAVING true_spend > 0
       ORDER BY month DESC, true_spend DESC`,
    )
    .all() as MonthlyRow[];
  const totals = d
    .prepare(
      `SELECT
         COUNT(*) AS total_txns,
         SUM(CASE WHEN reconciled = 1 THEN 1 ELSE 0 END) AS reconciled,
         SUM(CASE WHEN reconciled = 0 THEN 1 ELSE 0 END) AS pending
       FROM transactions`,
    )
    .get() as { total_txns: number; reconciled: number; pending: number };
  return { transactions, monthly, totals };
}

export default function Dashboard() {
  const { transactions, monthly, totals } = loadData();
  const byMonth = new Map<string, MonthlyRow[]>();
  for (const row of monthly) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month)!.push(row);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm opacity-70 mt-1">
          True personal spend = Splitwise shares + unreconciled credit card +
          unreconciled Venmo outflows. Unmatched CC charges count in full
          until you reconcile them.
        </p>
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
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.category}
                        className="border-t border-black/5 dark:border-white/5"
                      >
                        <td className="py-1">{r.category}</td>
                        <td className="py-1 text-right font-mono">
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-60">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="pr-4">Source</th>
                <th className="pr-4">Merchant</th>
                <th className="pr-4 text-right">Total</th>
                <th className="pr-4 text-right">My share</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-black/5 dark:border-white/5"
                >
                  <td className="py-1 pr-4 font-mono">{t.date}</td>
                  <td className="pr-4">{t.source}</td>
                  <td className="pr-4">{t.merchant_raw}</td>
                  <td className="pr-4 text-right font-mono">
                    ${t.amount_total.toFixed(2)}
                  </td>
                  <td className="pr-4 text-right font-mono">
                    ${t.amount_my_share.toFixed(2)}
                  </td>
                  <td>{t.reconciled ? "merged" : "pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
