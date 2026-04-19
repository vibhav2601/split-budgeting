"use client";

import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";

export default function ReimbursementConfirmButton({
  creditCardTxn,
  venmoTxns,
  label,
  className,
}: {
  creditCardTxn: Transaction;
  venmoTxns: Transaction[];
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const venmoTotal = useMemo(
    () => venmoTxns.reduce((sum, txn) => sum + txn.amount_total, 0),
    [venmoTxns],
  );
  const defaultAmount = Math.max(0, creditCardTxn.amount_total - venmoTotal);
  const [amountInput, setAmountInput] = useState(defaultAmount.toFixed(2));
  const parsedAmount = Number(amountInput);
  const validationError =
    amountInput.trim() === ""
      ? "Enter an amount."
      : !Number.isFinite(parsedAmount)
        ? "Enter a valid number."
      : parsedAmount < 0
        ? "Amount cannot be negative."
      : parsedAmount > creditCardTxn.amount_total
        ? `Amount cannot exceed $${creditCardTxn.amount_total.toFixed(2)}.`
      : null;

  function openModal() {
    setAmountInput(defaultAmount.toFixed(2));
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function confirm() {
    if (busy || validationError) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reimbursements/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credit_card_txn_id: creditCardTxn.id,
          venmo_txn_ids: venmoTxns.map((txn) => txn.id),
          true_my_share: parsedAmount,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to merge reimbursements.");
      setOpen(false);
      startTransition(() => {
        router.push("/");
        router.refresh();
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={openModal} className={className}>
        {label}
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
                  Adjust the net personal expense after subtracting received Venmo reimbursements.
                </p>
              </div>

              <div className="space-y-2 rounded border border-black/10 dark:border-white/10 p-3 text-sm">
                <div>
                  <div className="text-xs uppercase opacity-60">Credit card charge</div>
                  <div className="font-medium">{creditCardTxn.merchant_raw}</div>
                  <div className="font-mono opacity-70">
                    {creditCardTxn.date} · total ${creditCardTxn.amount_total.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase opacity-60">Received Venmo reimbursements</div>
                  <div className="font-medium">
                    {venmoTxns.length} selected · ${venmoTotal.toFixed(2)} total
                  </div>
                  <div className="text-xs opacity-60">
                    ${creditCardTxn.amount_total.toFixed(2)} - ${venmoTotal.toFixed(2)} = $
                    {defaultAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium">Amount counted in your expenses</span>
                <input
                  type="number"
                  min="0"
                  max={creditCardTxn.amount_total.toFixed(2)}
                  step="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  disabled={busy}
                  className="w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                />
                <p className="text-xs opacity-60">
                  Allowed range: $0.00 to ${creditCardTxn.amount_total.toFixed(2)}.
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
