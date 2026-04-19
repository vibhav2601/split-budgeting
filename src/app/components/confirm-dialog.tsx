"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: "default" | "danger";
  skipFutureLabel?: string;
  skipFutureValue?: boolean;
  onSkipFutureChange?: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  tone = "default",
  skipFutureLabel,
  skipFutureValue = false,
  onSkipFutureChange,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmClassName =
    tone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-black dark:hover:bg-red-400"
      : "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm opacity-70">{description}</p>
        </div>
        {skipFutureLabel && onSkipFutureChange ? (
          <label className="mt-4 flex items-center gap-2 text-sm opacity-80">
            <input
              type="checkbox"
              checked={skipFutureValue}
              onChange={(e) => onSkipFutureChange(e.target.checked)}
              disabled={busy}
            />
            <span>{skipFutureLabel}</span>
          </label>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-3 py-2 text-sm disabled:opacity-50 ${confirmClassName}`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
