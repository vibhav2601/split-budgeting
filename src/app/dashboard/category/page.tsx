import Link from "next/link";
import CategoryTransactionsTable from "./category-transactions-table";
import { db } from "@/lib/db";
import { VENMO_ADJUSTMENTS_CATEGORY } from "@/lib/expense-summary";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

type CategoryPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    category?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function loadTransactions(month: string, category: string): Transaction[] {
  return db()
    .prepare(
      `SELECT * FROM transactions
       WHERE substr(date, 1, 7) = ?
         AND COALESCE(category, 'Uncategorized') = ?
       ORDER BY date DESC, id DESC`,
    )
    .all(month, category) as Transaction[];
}

function loadVenmoAdjustmentSummary(month: string): { count: number; total: number } {
  return db()
    .prepare(
      `SELECT
         COUNT(*) AS count,
         ROUND(COALESCE(SUM(amount_my_share), 0), 2) AS total
       FROM transactions
       WHERE substr(date, 1, 7) = ?
         AND source = 'venmo'
         AND reconciled = 0
         AND payer = 'me'`,
    )
    .get(month) as { count: number; total: number };
}

export default async function DashboardCategoryPage({ searchParams }: CategoryPageProps) {
  const params = await searchParams;
  const month = firstValue(params.month);
  const category = firstValue(params.category);

  if (!month || !category) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Category transactions</h1>
        <p className="text-sm opacity-60">
          Open this page from a category row on the dashboard.
        </p>
        <Link href="/" className="underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const rows = loadTransactions(month, category);
  const venmoAdjustmentSummary = category === VENMO_ADJUSTMENTS_CATEGORY
    ? loadVenmoAdjustmentSummary(month)
    : null;
  const isVenmoAdjustments = category === VENMO_ADJUSTMENTS_CATEGORY;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{category}</h1>
          <p className="text-sm opacity-70 mt-1">
            {isVenmoAdjustments
              ? `${month} · ${venmoAdjustmentSummary?.count ?? 0} outgoing Venmo adjustment${
                  (venmoAdjustmentSummary?.count ?? 0) === 1 ? "" : "s"
                } totaling $${(venmoAdjustmentSummary?.total ?? 0).toFixed(2)}.`
              : `${month} · ${rows.length} transaction${rows.length === 1 ? "" : "s"} in this category.
            You can delete rows, open merge flows, or change category from here.`}
          </p>
        </div>
        <Link
          href="/"
          className="px-3 py-1.5 text-sm border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10"
        >
          Back to dashboard
        </Link>
      </header>

      {isVenmoAdjustments ? (
        <section className="border border-black/10 dark:border-white/10 rounded p-4">
          <p className="text-sm opacity-70">
            Unreconciled outgoing Venmo amounts are rolled up into a monthly
            adjustment instead of appearing here as individual category transactions.
            Raw Venmo rows are still available elsewhere in the app, including the
            Database page.
          </p>
        </section>
      ) : (
        <CategoryTransactionsTable initialRows={rows} pageCategory={category} />
      )}
    </div>
  );
}
