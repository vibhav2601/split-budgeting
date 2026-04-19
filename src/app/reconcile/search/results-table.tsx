"use client";

import { useEffect, useMemo, useState } from "react";
import MineOnlyButton from "@/app/mine-only-button";
import MergeConfirmButton from "@/app/reconcile/merge-confirm-button";
import type { Transaction } from "@/lib/types";

function dedupeTransactions(transactions: Transaction[]): Transaction[] {
  const byId = new Map<number, Transaction>();
  for (const txn of transactions) {
    byId.set(txn.id, txn);
  }
  return [...byId.values()];
}

export default function ReconcileSearchResultsTable({
  splitwiseTxn,
  initialTransactions,
  initialSelectedTransactions,
}: {
  splitwiseTxn: Transaction;
  initialTransactions: Transaction[];
  initialSelectedTransactions: Transaction[];
}) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [selectedTransactions, setSelectedTransactions] = useState(() =>
    dedupeTransactions(initialSelectedTransactions),
  );

  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  useEffect(() => {
    setSelectedTransactions(dedupeTransactions(initialSelectedTransactions));
  }, [initialSelectedTransactions]);

  const selectedIds = useMemo(
    () => new Set(selectedTransactions.map((txn) => txn.id)),
    [selectedTransactions],
  );

  const visibleSelectedCount = useMemo(
    () => transactions.filter((txn) => selectedIds.has(txn.id)).length,
    [selectedIds, transactions],
  );
  const hiddenSelectedCount = selectedTransactions.length - visibleSelectedCount;

  function toggleSelection(txn: Transaction) {
    setSelectedTransactions((prev) => {
      if (prev.some((selectedTxn) => selectedTxn.id === txn.id)) {
        return prev.filter((selectedTxn) => selectedTxn.id !== txn.id);
      }
      return dedupeTransactions([...prev, txn]);
    });
  }

  return (
    <div className="space-y-3">
      {selectedTransactions.map((txn) => (
        <input
          key={txn.id}
          type="hidden"
          name="selected_ids"
          value={txn.id}
          form="reconcile-search-form"
        />
      ))}

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm opacity-60">
          <p>
            Selected {selectedTransactions.length} transaction
            {selectedTransactions.length === 1 ? "" : "s"}.
          </p>
          {hiddenSelectedCount > 0 && (
            <p className="text-xs">
              {hiddenSelectedCount} selected transaction
              {hiddenSelectedCount === 1 ? "" : "s"} not shown in this search still stay in the merge set.
            </p>
          )}
        </div>
        <MergeConfirmButton
          splitwiseTxn={splitwiseTxn}
          matchedTxns={selectedTransactions}
          label="Merge selected transactions"
          className="px-3 py-2 text-sm rounded bg-black text-white dark:bg-white dark:text-black disabled:opacity-50"
          redirectTo="/reconcile"
        />
      </div>

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2 px-3">Pick</th>
              <th className="px-3">Date</th>
              <th className="px-3">Merchant</th>
              <th className="px-3">Category</th>
              <th className="px-3 text-right">Total</th>
              <th className="px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr className="border-t border-black/5 dark:border-white/5">
                <td colSpan={6} className="px-3 py-4 text-sm opacity-60">
                  No credit-card transactions match the current search. Your existing selection is still preserved above.
                </td>
              </tr>
            )}
            {transactions.map((txn) => (
              <tr
                key={txn.id}
                className="border-t border-black/5 dark:border-white/5"
              >
                <td className="py-2 px-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(txn.id)}
                    onChange={() => toggleSelection(txn)}
                  />
                </td>
                <td className="px-3 font-mono">{txn.date}</td>
                <td className="px-3">
                  <div className="font-medium">{txn.merchant_raw}</div>
                  {txn.description && (
                    <div className="text-xs opacity-60">{txn.description}</div>
                  )}
                </td>
                <td className="px-3">{txn.category ?? "—"}</td>
                <td className="px-3 text-right font-mono">
                  ${txn.amount_total.toFixed(2)}
                </td>
                <td className="px-3">
                  <MineOnlyButton
                    transactionId={txn.id}
                    mineOnly={Boolean(txn.mine_only)}
                    compact
                    iconOnly
                    autoRefresh={false}
                    onChanged={(nextMineOnly) => {
                      if (!nextMineOnly) return;
                      setTransactions((prev) => prev.filter((row) => row.id !== txn.id));
                      setSelectedTransactions((prev) =>
                        prev.filter((row) => row.id !== txn.id),
                      );
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
