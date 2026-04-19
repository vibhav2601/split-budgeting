"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { MergeModalIcon, txnActionIconButtonClass } from "@/app/components/txn-actions";
import type { Transaction } from "@/lib/types";

export default function MergeConfirmButton({
  splitwiseTxn,
  matchedTxn,
  matchedTxns,
  label,
  className,
  iconOnly = false,
  onMerged,
  redirectTo,
}: {
  splitwiseTxn: Transaction;
  matchedTxn?: Transaction;
  matchedTxns?: Transaction[];
  label: string;
  className?: string;
  iconOnly?: boolean;
  onMerged?: () => void | Promise<void>;
  redirectTo?: string;
}) {
  const router = useRouter();
  const selectedTxns = matchedTxns ?? (matchedTxn ? [matchedTxn] : []);
  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState(splitwiseTxn.amount_my_share.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const maxAmount = selectedTxns.reduce((sum, txn) => sum + txn.amount_total, 0);
  const parsedAmount = Number(amountInput);
  const validationError =
    selectedTxns.length === 0
      ? "Select at least one matched transaction."
      : amountInput.trim() === ""
        ? "Enter an amount."
        : !Number.isFinite(parsedAmount)
          ? "Enter a valid number."
          : parsedAmount < 0
            ? "Amount cannot be negative."
            : parsedAmount > maxAmount
              ? `Amount cannot exceed $${maxAmount.toFixed(2)}.`
              : null;

  function openModal() {
    if (selectedTxns.length === 0) return;
    setAmountInput(splitwiseTxn.amount_my_share.toFixed(2));
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function confirm() {
    if (validationError || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reconcile/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitwise_txn_id: splitwiseTxn.id,
          other_txn_ids: selectedTxns.map((txn) => txn.id),
          true_my_share: parsedAmount,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to merge transactions.");
      }
      setOpen(false);
      await onMerged?.();
      if (redirectTo) {
        startTransition(() => {
          router.push(redirectTo);
          router.refresh();
        });
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  const triggerClass = iconOnly
    ? `${txnActionIconButtonClass}${className ? ` ${className}` : ""}`
    : className;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={triggerClass}
        title={label}
        aria-label={label}
      >
        {iconOnly ? (
          <MergeModalIcon className="size-[1.125rem] shrink-0" />
        ) : (
          label
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/10 bg-white p-5 shadow-xl dark:bg-black">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">
                  ${Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : "0.00"} will be
                  {" "}counted in your expenses only
                </h2>
                <p className="mt-1 text-sm opacity-70">
                  Adjust how much of this merge should count toward your true personal spend.
                </p>
              </div>

              <div className="space-y-2 rounded border border-black/10 dark:border-white/10 p-3 text-sm">
                <div>
                  <div className="text-xs uppercase opacity-60">Splitwise</div>
                  <div className="font-medium">{splitwiseTxn.merchant_raw}</div>
                  <div className="font-mono opacity-70">
                    {splitwiseTxn.date} · total ${splitwiseTxn.amount_total.toFixed(2)} ·
                    my share ${splitwiseTxn.amount_my_share.toFixed(2)}
                  </div>
                </div>
                {selectedTxns.map((txn) => (
                  <div key={txn.id}>
                    <div className="text-xs uppercase opacity-60">
                      {txn.source === "credit_card" ? "Credit card" : "Venmo"}
                    </div>
                    <div className="font-medium">{txn.merchant_raw}</div>
                    <div className="font-mono opacity-70">
                      {txn.date} · total ${txn.amount_total.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Amount counted in your expenses</span>
                <input
                  type="number"
                  min="0"
                  max={maxAmount.toFixed(2)}
                  step="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  disabled={busy}
                  className="w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                />
                <p className="text-xs opacity-60">
                  Allowed range: $0.00 to ${maxAmount.toFixed(2)}.
                </p>
              </label>

              {(validationError || error) && (
                <p className="text-sm text-red-500">{validationError ?? error}</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy}
                  className="px-3 py-2 text-sm rounded border border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy || Boolean(validationError)}
                  className="px-3 py-2 text-sm rounded bg-black text-white dark:bg-white dark:text-black disabled:opacity-50"
                >
                  {busy ? "Confirming…" : "Confirm merge"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
