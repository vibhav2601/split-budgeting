import Link from "next/link";
import MineOnlyButton from "@/app/mine-only-button";
import ReconcileSearchResultsTable from "@/app/reconcile/search/results-table";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  shouldExcludeOtherTxnFromReconcile,
  shouldExcludeSplitwiseFromReconcile,
  transactionMatchesSearch,
} from "@/lib/reconcile-filters";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{
    splitwise_txn_id?: string | string[];
    q?: string | string[];
    date_from?: string | string[];
    date_to?: string | string[];
    selected_ids?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db_ = new Date(b).getTime();
  return Math.abs(da - db_) / 86_400_000;
}

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function parseISODateFilter(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function parseSelectedTransactionIds(value: string | string[] | undefined): number[] {
  const parsed = new Set<number>();
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];

  for (const rawValue of rawValues) {
    for (const part of rawValue.split(",")) {
      const id = Number(part.trim());
      if (Number.isInteger(id) && id > 0) {
        parsed.add(id);
      }
    }
  }

  return [...parsed];
}

function loadSplitwiseTransaction(id: number): Transaction | null {
  const row = db().prepare("SELECT * FROM transactions WHERE id = ?").get(id) as
    | Transaction
    | undefined;
  if (!row || row.source !== "splitwise") return null;
  return row;
}

function loadCreditCardTransactions(
  splitwiseTxn: Transaction,
  query: string,
  dateFrom: string,
  dateTo: string,
): Transaction[] {
  const rows = db()
    .prepare(
      `SELECT * FROM transactions
       WHERE source = 'credit_card'
         AND reconciled = 0
         AND mine_only = 0
       ORDER BY date DESC, id DESC`,
    )
    .all() as Transaction[];

  return rows
    .filter((txn) => !shouldExcludeOtherTxnFromReconcile(txn))
    .filter((txn) => transactionMatchesSearch(txn, query))
    .filter((txn) => !dateFrom || txn.date >= dateFrom)
    .filter((txn) => !dateTo || txn.date <= dateTo)
    .sort((a, b) => {
      const dateDiff = daysBetween(a.date, splitwiseTxn.date) - daysBetween(b.date, splitwiseTxn.date);
      if (dateDiff !== 0) return dateDiff;
      const amountDiff =
        Math.abs(a.amount_total - splitwiseTxn.amount_total) -
        Math.abs(b.amount_total - splitwiseTxn.amount_total);
      if (amountDiff !== 0) return amountDiff;
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    })
    .slice(0, 100);
}

function loadSelectedCreditCardTransactions(ids: number[]): Transaction[] {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db()
    .prepare(
      `SELECT * FROM transactions
       WHERE source = 'credit_card'
         AND reconciled = 0
         AND mine_only = 0
         AND id IN (${placeholders})
       ORDER BY date DESC, id DESC`,
    )
    .all(...ids) as Transaction[];

  return rows.filter((txn) => !shouldExcludeOtherTxnFromReconcile(txn));
}

export default async function ReconcileSearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const rawSplitwiseTxnId = firstValue(params.splitwise_txn_id);
  const splitwiseTxnId = Number(rawSplitwiseTxnId);
  const query = firstValue(params.q).trim();
  const dateFrom = parseISODateFilter(firstValue(params.date_from));
  const dateTo = parseISODateFilter(firstValue(params.date_to));
  const selectedTxnIds = parseSelectedTransactionIds(params.selected_ids);

  const splitwiseTxn = Number.isInteger(splitwiseTxnId) && splitwiseTxnId > 0
    ? loadSplitwiseTransaction(splitwiseTxnId)
    : null;

  const creditCardTransactions = splitwiseTxn && !shouldExcludeSplitwiseFromReconcile(splitwiseTxn)
    ? loadCreditCardTransactions(splitwiseTxn, query, dateFrom, dateTo)
    : [];
  const selectedCreditCardTransactions = splitwiseTxn && !shouldExcludeSplitwiseFromReconcile(splitwiseTxn)
    ? loadSelectedCreditCardTransactions(selectedTxnIds)
    : [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search Credit Card Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a Splitwise transaction from reconcile, then search unreconciled
            credit-card transactions to merge into it.
          </p>
        </div>
        <Link
          href="/reconcile"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted whitespace-nowrap"
        >
          ← Back to reconcile
        </Link>
      </header>

      {/* Secondary nav */}
      <nav className="flex gap-1 border-b border-border pb-3">
        <Link
          href="/reconcile"
          className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        >
          Queue
        </Link>
        <Link
          href="/reconcile/search"
          className="px-3 py-1.5 text-sm rounded-md bg-muted font-medium transition-colors"
        >
          Search
        </Link>
      </nav>

      {!splitwiseTxn && (
        <p className="text-sm text-muted-foreground">
          Open this page from a Splitwise row in{" "}
          <Link href="/reconcile" className="underline">
            Splitwise Reconcile
          </Link>{" "}
          to search credit-card transactions for that expense.
        </p>
      )}

      {splitwiseTxn && shouldExcludeSplitwiseFromReconcile(splitwiseTxn) && (
        <p className="text-sm text-muted-foreground">
          This Splitwise transaction is excluded from reconcile.
        </p>
      )}

      {splitwiseTxn && !shouldExcludeSplitwiseFromReconcile(splitwiseTxn) && (
        <>
          <Card>
            <CardContent>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Splitwise transaction</div>
              <div className="font-medium mt-1">{splitwiseTxn.merchant_raw}</div>
              <div className="text-sm text-muted-foreground font-mono tabular-nums">
                {splitwiseTxn.date} · total ${splitwiseTxn.amount_total.toFixed(2)} ·
                my share ${splitwiseTxn.amount_my_share.toFixed(2)} ·
                paid by {splitwiseTxn.payer}
              </div>
              {splitwiseTxn.raw_json && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm underline underline-offset-2 text-muted-foreground">
                    View Splitwise raw JSON
                  </summary>
                  <pre className="mt-2 text-xs p-3 rounded-lg bg-muted overflow-x-auto">
                    {prettyJson(splitwiseTxn.raw_json)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>

          <form id="reconcile-search-form" method="GET" className="grid gap-3">
            <input type="hidden" name="splitwise_txn_id" value={splitwiseTxn.id} />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search merchant, date, amount, or category"
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
              >
                Search
              </button>
            </div>
            <label className="grid gap-2 text-sm md:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
              <span className="text-muted-foreground">Date range</span>
              <input
                type="date"
                name="date_from"
                defaultValue={dateFrom}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-center text-muted-foreground">-</span>
              <input
                type="date"
                name="date_to"
                defaultValue={dateTo}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </form>

          <p className="text-sm text-muted-foreground">
            Showing {creditCardTransactions.length} unreconciled credit-card transaction
            {creditCardTransactions.length === 1 ? "" : "s"} in this search.
          </p>

          {creditCardTransactions.length === 0 && selectedCreditCardTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No credit-card transactions match this search.
            </p>
          ) : (
            <ReconcileSearchResultsTable
              splitwiseTxn={splitwiseTxn}
              initialTransactions={creditCardTransactions}
              initialSelectedTransactions={selectedCreditCardTransactions}
            />
          )}
        </>
      )}
    </div>
  );
}
