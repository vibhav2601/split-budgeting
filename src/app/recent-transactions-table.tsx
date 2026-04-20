"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import MineOnlyButton from "./mine-only-button";
import TransactionSourceLabel from "./components/transaction-source-label";
import { ReconcileTxnLink, ReimbursementTxnLink } from "./components/txn-actions";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { Transaction } from "@/lib/types";

export default function RecentTransactionsTable({
  initialTransactions,
}: {
  initialTransactions: Transaction[];
}) {
  const router = useRouter();
  const [transactions, setTransactions] = useState(initialTransactions);
  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    const next: Record<number, string> = {};
    for (const txn of initialTransactions) {
      next[txn.id] = txn.category?.trim() || "";
    }
    return next;
  });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function applyCategory(transaction: Transaction, category: string) {
    if (savingId !== null) return;
    setSavingId(transaction.id);
    setError(null);
    try {
      const res = await fetch("/api/categories/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: transaction.id,
          category,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update category.");
      }

      setTransactions((prev) =>
        prev.map((txn) => (txn.id === transaction.id ? { ...txn, category } : txn)),
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="pr-4">Source</th>
              <th className="pr-4">Merchant</th>
              <th className="pr-4 text-right">Total</th>
              <th className="pr-4 text-right">My share</th>
              <th className="pr-4">Status</th>
              <th className="pr-4">Category</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const draft = drafts[t.id] ?? t.category ?? "";
              const busy = savingId === t.id;
              return (
                <tr
                  key={t.id}
                  className="border-t border-black/5 dark:border-white/5"
                >
                  <td className="py-1 pr-4 font-mono">{t.date}</td>
                  <td className="pr-4">
                    <TransactionSourceLabel transaction={t} />
                  </td>
                  <td className="pr-4">{t.merchant_raw}</td>
                  <td className="pr-4 text-right font-mono">
                    ${t.amount_total.toFixed(2)}
                  </td>
                  <td className="pr-4 text-right font-mono">
                    ${t.amount_my_share.toFixed(2)}
                  </td>
                  <td className="pr-4">
                    {t.reconciled ? "merged" : t.mine_only ? "mine only" : "pending"}
                  </td>
                  <td className="pr-4 min-w-56">
                    <div className="flex items-center gap-2">
                      <select
                        value={draft}
                        disabled={busy}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [t.id]: e.target.value,
                          }))
                        }
                        className="min-w-44 rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="">Choose a category</option>
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !draft || draft === (t.category ?? "")}
                        onClick={() => void applyCategory(t, draft)}
                        className="px-3 py-2 rounded bg-black text-white dark:bg-white dark:text-black text-sm disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </td>
                  <td>
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
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
