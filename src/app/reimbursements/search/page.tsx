import Link from "next/link";
import MineOnlyButton from "@/app/mine-only-button";
import ReimbursementConfirmButton from "@/app/reimbursements/confirm-button";
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
          <h1 className="text-2xl font-semibold">Merge Venmo Reimbursements</h1>
          <p className="text-sm opacity-70 mt-1">
            Search received Venmo transactions and subtract them from a credit-card charge.
          </p>
        </div>
        <Link
          href="/"
          className="px-3 py-1.5 text-sm border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10"
        >
          Back to dashboard
        </Link>
      </header>

      {!creditCardTxn && (
        <p className="text-sm opacity-60">
          Open this page from a credit-card transaction to merge received Venmo reimbursements into it.
        </p>
      )}

      {creditCardTxn && (
        <>
          <section className="border border-black/10 dark:border-white/10 rounded p-4">
            <div className="text-xs uppercase opacity-60">Credit card transaction</div>
            <div className="font-medium mt-1">{creditCardTxn.merchant_raw}</div>
            <div className="text-sm opacity-70 font-mono">
              {creditCardTxn.date} · total ${creditCardTxn.amount_total.toFixed(2)} ·
              category {creditCardTxn.category ?? "—"}
            </div>
          </section>

          <form method="GET" className="space-y-3">
            <input type="hidden" name="credit_card_txn_id" value={creditCardTxn.id} />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search Venmo merchant, date, amount, or description"
                className="w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black text-sm"
              >
                Search
              </button>
            </div>

            <p className="text-sm opacity-60">
              Selected reimbursements: {selectedVenmo.length} · ${selectedTotal.toFixed(2)}
            </p>

            {selectedVenmo.length > 0 && (
              <div className="flex items-center gap-3">
                <ReimbursementConfirmButton
                  creditCardTxn={creditCardTxn}
                  venmoTxns={selectedVenmo}
                  label="Merge selected reimbursements"
                  className="px-3 py-2 text-sm rounded bg-black text-white dark:bg-white dark:text-black"
                />
                <span className="text-xs opacity-60">
                  Net default = ${(Math.max(0, creditCardTxn.amount_total - selectedTotal)).toFixed(2)}
                </span>
              </div>
            )}

            {venmoTransactions.length === 0 ? (
              <p className="text-sm opacity-60">
                No received Venmo transactions match this search.
              </p>
            ) : (
              <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="text-left opacity-60">
                    <tr>
                      <th className="py-2 px-3">Select</th>
                      <th className="px-3">Date</th>
                      <th className="px-3">Merchant</th>
                      <th className="px-3">Description</th>
                      <th className="px-3 text-right">Total</th>
                      <th className="px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venmoTransactions.map((txn) => (
                      <tr key={txn.id} className="border-t border-black/5 dark:border-white/5">
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            name="selected"
                            value={txn.id}
                            defaultChecked={selectedIds.has(txn.id)}
                          />
                        </td>
                        <td className="px-3 font-mono">{txn.date}</td>
                        <td className="px-3 font-medium">{txn.merchant_raw}</td>
                        <td className="px-3">{txn.description ?? "—"}</td>
                        <td className="px-3 text-right font-mono">${txn.amount_total.toFixed(2)}</td>
                        <td className="px-3">
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
            )}
          </form>
        </>
      )}
    </div>
  );
}
