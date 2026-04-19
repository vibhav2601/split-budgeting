"use client";

import { useMemo, useState } from "react";
import MineOnlyButton from "./mine-only-button";
import { ReconcileTxnLink, ReimbursementTxnLink } from "./components/txn-actions";
import type { Transaction } from "@/lib/types";

type SortKey = "total" | "share";

function sourceLabel(source: Transaction["source"]): string {
  return source.replaceAll("_", " ");
}

export default function UnmergedTransactionsSection({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const [sortBy, setSortBy] = useState<SortKey>("total");

  const visible = useMemo(() => {
    const ordered = [...transactions].sort((a, b) => {
      const primary =
        sortBy === "share"
          ? b.amount_my_share - a.amount_my_share
          : b.amount_total - a.amount_total;
      if (primary !== 0) return primary;
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });
    return ordered.slice(0, 20);
  }, [sortBy, transactions]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-4">
        <div>
          <h2 className="text-lg font-medium">Highest unmerged transactions</h2>
          <p className="text-sm opacity-60 mt-1">
            Largest actionable unreconciled credit card and outgoing Venmo items.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setSortBy("total")}
            className={`px-3 py-1.5 rounded border ${
              sortBy === "total"
                ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
                : "border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            Sort by total
          </button>
          <button
            type="button"
            onClick={() => setSortBy("share")}
            className={`px-3 py-1.5 rounded border ${
              sortBy === "share"
                ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
                : "border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            Sort by my share
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm opacity-60">
          No actionable unmerged card or Venmo transactions right now.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left opacity-60">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="pr-4">Source</th>
                <th className="pr-4">Merchant</th>
                <th className="pr-4 text-right">Total</th>
                <th className="pr-4 text-right">My share</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((txn) => (
                <tr
                  key={txn.id}
                  className="border-t border-black/5 dark:border-white/5"
                >
                  <td className="py-1 pr-4 font-mono">{txn.date}</td>
                  <td className="pr-4">{sourceLabel(txn.source)}</td>
                  <td className="pr-4">{txn.merchant_raw}</td>
                  <td className="pr-4 text-right font-mono">
                    ${txn.amount_total.toFixed(2)}
                  </td>
                  <td className="pr-4 text-right font-mono">
                    ${txn.amount_my_share.toFixed(2)}
                  </td>
                  <td>
                    <div className="flex flex-row items-center gap-1">
                      <ReconcileTxnLink transactionId={txn.id} />
                      {txn.source === "credit_card" && (
                        <ReimbursementTxnLink transactionId={txn.id} />
                      )}
                      <MineOnlyButton
                        transactionId={txn.id}
                        mineOnly={Boolean(txn.mine_only)}
                        compact
                        iconOnly
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
