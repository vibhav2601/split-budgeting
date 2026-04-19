"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

export default function MineOnlyButton({
  transactionId,
  mineOnly,
  compact = false,
  autoRefresh = true,
  onChanged,
}: {
  transactionId: number;
  mineOnly: boolean;
  compact?: boolean;
  autoRefresh?: boolean;
  onChanged?: (nextMineOnly: boolean) => void | Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const nextMineOnly = !mineOnly;
    try {
      const res = await fetch("/api/transactions/mine-only", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: transactionId,
          mine_only: nextMineOnly,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "failed");
      await onChanged?.(nextMineOnly);
      if (autoRefresh) {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = compact
    ? mineOnly
      ? "Undo mine only"
      : "Mine only"
    : mineOnly
      ? "Undo mine only"
      : "This is mine only";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-sm underline underline-offset-2 disabled:opacity-50"
      >
        {busy ? "Saving…" : label}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
