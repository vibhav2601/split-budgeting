import Link from "next/link";
import MineOnlyButton from "@/app/mine-only-button";
import ReimbursementConfirmButton from "@/app/reimbursements/confirm-button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { shouldExcludeOtherTxnFromReconcile, transactionMatchesSearch } from "@/lib/reconcile-filters";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{
    credit_card_txn_id?: string | string[];
    q?: string | string[];
    selected?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function values(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db_ = new Date(b).getTime();
  return Math.abs(da - db_) / 86_400_000;
}

function loadCreditCardTransaction(id: number): Transaction | null {
  const row = db().prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Transaction | undefined;
  if (!row || row.source !== "credit_card") return null;
  return row;
}

function loadIncomingVenmoTransactions(creditCardTxn: Transaction, query: string): Transaction[] {
  const rows = db()
    .prepare(
      `SELECT * FROM transactions
       WHERE source = 'venmo'
         AND payer = 'other'
         AND reconciled = 0
         AND mine_only = 0
       ORDER BY date DESC, id DESC`,
    )
    .all() as Transaction[];

  return rows
    .filter((txn) => !shouldExcludeOtherTxnFromReconcile(txn))
    .filter((txn) => transactionMatchesSearch(txn, query))
    .sort((a, b) => {
      const dateDiff = daysBetween(a.date, creditCardTxn.date) - daysBetween(b.date, creditCardTxn.date);
      if (dateDiff !== 0) return dateDiff;
      const amountDiff =
        Math.abs(a.amount_total - creditCardTxn.amount_total) -
        Math.abs(b.amount_total - creditCardTxn.amount_total);
      if (amountDiff !== 0) return amountDiff;
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    })
    .slice(0, 200);
}

export default async function ReimbursementSearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const creditCardTxnId = Number(firstValue(params.credit_card_txn_id));
  const query = firstValue(params.q).trim();
  const selectedIds = new Set(
    values(params.selected)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  );

  const creditCardTxn = Number.isInteger(creditCardTxnId) && creditCardTxnId > 0
    ? loadCreditCardTransaction(creditCardTxnId)
    : null;
  const venmoTransactions = creditCardTxn ? loadIncomingVenmoTransactions(creditCardTxn, query) : [];
  const selectedVenmo = venmoTransactions.filter((txn) => selectedIds.has(txn.id));
  const selectedTotal = selectedVenmo.reduce((sum, txn) => sum + txn.amount_total, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merge Venmo Reimbursements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search received Venmo transactions and subtract them from a credit-card charge.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted whitespace-nowrap"
        >
          ← Dashboard
        </Link>
      </header>

      {!creditCardTxn && (
        <p className="text-sm text-muted-foreground">
          Open this page from a credit-card transaction to merge received Venmo reimbursements into it.
        </p>
      )}

      {creditCardTxn && (
        <>
          <Card>
            <CardContent>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Credit card transaction</div>
              <div className="font-medium mt-1">{creditCardTxn.merchant_raw}</div>
              <div className="text-sm text-muted-foreground font-mono tabular-nums">
                {creditCardTxn.date} · total ${creditCardTxn.amount_total.toFixed(2)} ·
                category {creditCardTxn.category ?? "—"}
              </div>
            </CardContent>
          </Card>

          <form method="GET" className="space-y-3">
            <input type="hidden" name="credit_card_txn_id" value={creditCardTxn.id} />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search Venmo merchant, date, amount, or description"
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
              >
                Search
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Selected reimbursements: {selectedVenmo.length} · <span className="font-mono tabular-nums">${selectedTotal.toFixed(2)}</span>
            </p>

            {selectedVenmo.length > 0 && (
              <div className="flex items-center gap-3">
                <ReimbursementConfirmButton
                  creditCardTxn={creditCardTxn}
                  venmoTxns={selectedVenmo}
                  label="Merge selected reimbursements"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
                />
                <span className="text-xs text-muted-foreground">
                  Net default = <span className="font-mono tabular-nums">${(Math.max(0, creditCardTxn.amount_total - selectedTotal)).toFixed(2)}</span>
                </span>
              </div>
            )}

            {venmoTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No received Venmo transactions match this search.
              </p>
            ) : (
              <Card>
                <CardContent className="px-0 pb-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">Select</th>
                          <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                          <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Merchant</th>
                          <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Description</th>
                          <th className="py-2.5 px-3 text-right text-xs font-medium text-muted-foreground">Total</th>
                          <th className="py-2.5 px-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {venmoTransactions.map((txn) => (
                          <tr key={txn.id} className="border-t border-border/60 hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-4">
                              <input
                                type="checkbox"
                                name="selected"
                                value={txn.id}
                                defaultChecked={selectedIds.has(txn.id)}
                              />
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-muted-foreground">{txn.date}</td>
                            <td className="py-2 px-3 font-medium">{txn.merchant_raw}</td>
                            <td className="py-2 px-3 text-muted-foreground">{txn.description ?? "—"}</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">${txn.amount_total.toFixed(2)}</td>
                            <td className="py-2 px-3">
                              <MineOnlyButton
                                transactionId={txn.id}
                                mineOnly={Boolean(txn.mine_only)}
                                compact
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </form>
        </>
      )}
    </div>
  );
}
