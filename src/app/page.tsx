import ResetDbButton from "./reset-db-button";
import MineOnlyButton from "./mine-only-button";
import { ReconcileTxnLink, ReimbursementTxnLink } from "./components/txn-actions";
import TransactionSourceLabel from "./components/transaction-source-label";
import MonthSwitcher from "./components/month-switcher";
import { CategoryDot } from "./components/category-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  loadMonthlyTrueSpendRows,
  loadAvailableMonths,
  loadMonthlyStats,
  loadCategoryCountsForMonth,
} from "@/lib/expense-summary";
import type { Transaction } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ month?: string | string[] }>;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getCurrentRealMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function loadRecentTransactions(month: string): Transaction[] {
  return db()
    .prepare(
      `SELECT * FROM transactions
       WHERE substr(date, 1, 7) = ?
       ORDER BY date DESC, id DESC
       LIMIT 50`,
    )
    .all(month) as Transaction[];
}

export default async function Dashboard({ searchParams }: PageProps) {
  const params = await searchParams;
  const d = db();
  const availableMonths = loadAvailableMonths(d);
  const monthParam = firstValue(params.month);
  const activeMonth = monthParam && availableMonths.includes(monthParam)
    ? monthParam
    : (availableMonths[0] ?? getCurrentRealMonth());

  const allRows = loadMonthlyTrueSpendRows(d);
  const monthRows = allRows.filter((r) => r.month === activeMonth);
  const totalSpend = monthRows.reduce((s, r) => s + r.true_spend, 0);

  const stats = availableMonths.length > 0
    ? loadMonthlyStats(d, activeMonth)
    : { total: 0, reconciled: 0, pending: 0 };

  const categoryCounts = loadCategoryCountsForMonth(d, activeMonth);
  const countMap = new Map(categoryCounts.map((c) => [c.category, c.count]));

  const transactions = loadRecentTransactions(activeMonth);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            True spend across accounts.
          </p>
        </div>
        <ResetDbButton />
      </header>

      {availableMonths.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-muted-foreground text-sm">No data yet.</p>
          <p className="text-sm">
            Head to{" "}
            <Link className="underline" href="/import">
              Import
            </Link>{" "}
            to get started.
          </p>
        </div>
      ) : (
        <>
          <MonthSwitcher
            months={availableMonths}
            current={activeMonth}
            totalSpend={totalSpend}
          />

          <section className="grid grid-cols-3 gap-4">
            <StatCard label="Transactions" value={stats.total ?? 0} />
            <StatCard label="Reconciled" value={stats.reconciled ?? 0} />
            <StatCard label="Pending review" value={stats.pending ?? 0} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium tracking-tight text-muted-foreground uppercase">
              Categories
            </h2>
            <Card>
              <CardContent className="pt-1 pb-1">
                {monthRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No spending data for this month.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {monthRows.map((r) => {
                      const count = countMap.get(r.category) ?? 0;
                      return (
                        <Link
                          key={r.category}
                          href={{
                            pathname: "/dashboard/category",
                            query: { month: activeMonth, category: r.category },
                          }}
                          className="flex items-center gap-3 py-3 hover:bg-muted/50 -mx-4 px-4 transition-colors rounded-sm group"
                        >
                          <CategoryDot category={r.category} />
                          <span className="flex-1 font-medium text-sm group-hover:text-foreground">
                            {r.category}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {count} txn{count !== 1 ? "s" : ""}
                          </span>
                          <span className="font-mono tabular-nums text-sm font-medium">
                            ${r.true_spend.toFixed(2)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium tracking-tight text-muted-foreground uppercase">
              Recent transactions
            </h2>
            <Card>
              <CardContent className="px-0 pb-0">
                {transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 px-4">
                    No transactions this month.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">Date</th>
                          <th className="py-2.5 pr-4 text-left text-xs font-medium text-muted-foreground">Source</th>
                          <th className="py-2.5 pr-4 text-left text-xs font-medium text-muted-foreground">Merchant</th>
                          <th className="py-2.5 pr-4 text-right text-xs font-medium text-muted-foreground">Total</th>
                          <th className="py-2.5 pr-4 text-right text-xs font-medium text-muted-foreground">My share</th>
                          <th className="py-2.5 pr-4 text-left text-xs font-medium text-muted-foreground">Status</th>
                          <th className="py-2.5 pr-4 text-left text-xs font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((t) => (
                          <tr
                            key={t.id}
                            className="border-t border-border/60 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2 px-4 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                              {t.date}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                              <TransactionSourceLabel transaction={t} />
                            </td>
                            <td className="py-2 pr-4 font-medium">{t.merchant_raw}</td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                              ${t.amount_total.toFixed(2)}
                            </td>
                            <td className="py-2 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                              ${t.amount_my_share.toFixed(2)}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                              {t.reconciled ? "merged" : t.mine_only ? "mine only" : "pending"}
                            </td>
                            <td className="py-2 pr-4">
                              {t.source !== "splitwise" && !t.reconciled ? (
                                <div className="flex flex-row items-center gap-1">
                                  <ReconcileTxnLink transactionId={t.id} />
                                  {t.source === "credit_card" && (
                                    <ReimbursementTxnLink transactionId={t.id} />
                                  )}
                                  <MineOnlyButton
                                    transactionId={t.id}
                                    mineOnly={Boolean(t.mine_only)}
                                    compact
                                    iconOnly
                                  />
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-mono tabular-nums font-semibold tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
