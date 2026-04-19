"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

function UserMineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function UserMineActiveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

export default function MineOnlyButton({
  transactionId,
  mineOnly,
  compact = false,
  iconOnly = false,
  autoRefresh = true,
  onChanged,
}: {
  transactionId: number;
  mineOnly: boolean;
  compact?: boolean;
  iconOnly?: boolean;
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

  const label = compact || iconOnly
    ? mineOnly
      ? "Undo mine only"
      : "Mine only"
    : mineOnly
      ? "Undo mine only"
      : "This is mine only";

  const iconClass = "size-[1.125rem] shrink-0";

  return (
    <div className={iconOnly ? "inline-flex flex-col items-center gap-0.5" : "space-y-1"}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={label}
        aria-label={label}
        className={
          iconOnly
            ? "inline-flex size-8 items-center justify-center rounded-md border border-black/10 bg-transparent text-current hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
            : "text-sm underline underline-offset-2 disabled:opacity-50"
        }
      >
        {iconOnly ? (
          busy ? (
            <SpinnerIcon className={`${iconClass} animate-spin`} />
          ) : mineOnly ? (
            <UserMineActiveIcon className={iconClass} />
          ) : (
            <UserMineIcon className={iconClass} />
          )
        ) : busy ? (
          "Saving…"
        ) : (
          label
        )}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
