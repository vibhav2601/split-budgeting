import Link from "next/link";
import CategoryTransactionsTable from "./category-transactions-table";
import { Card, CardContent } from "@/components/ui/card";
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const monthIndex = parseInt(month, 10) - 1;
  return `${MONTH_NAMES[monthIndex]} ${year}`;
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
        <h1 className="text-2xl font-semibold tracking-tight">Category transactions</h1>
        <p className="text-sm text-muted-foreground">
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
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href={`/?month=${month}`} className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          {" · "}
          <span>{formatMonth(month)}</span>
          {" · "}
          <span>{category}</span>
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{category}</h1>
          <Link
            href={`/?month=${month}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors whitespace-nowrap"
          >
            ← Back
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {isVenmoAdjustments
            ? `${formatMonth(month)} · ${venmoAdjustmentSummary?.count ?? 0} outgoing Venmo adjustment${
                (venmoAdjustmentSummary?.count ?? 0) === 1 ? "" : "s"
              } totaling $${(venmoAdjustmentSummary?.total ?? 0).toFixed(2)}.`
            : `${formatMonth(month)} · ${rows.length} transaction${rows.length === 1 ? "" : "s"} in this category.`}
        </p>
      </header>

      {isVenmoAdjustments ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unreconciled outgoing Venmo amounts are rolled up into a monthly
              adjustment instead of appearing here as individual category transactions.
              Raw Venmo rows are still available in the Database page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <CategoryTransactionsTable initialRows={rows} pageCategory={category} />
      )}
    </div>
  );
}
