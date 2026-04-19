"use client";

import { useState } from "react";
import ConfirmDialog from "@/app/components/confirm-dialog";

export default function ResetDbButton() {
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onResetConfirmed() {
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to clear database.");
      }
      setConfirmOpen(false);
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => {
          if (!submitting) setConfirmOpen(true);
        }}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded border border-red-500/30 text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
      >
        {submitting ? "Clearing..." : "Clear DB & restart"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <ConfirmDialog
        open={confirmOpen}
        title="Clear the entire database?"
        description="This will delete all imported data and restart the app. This cannot be undone."
        confirmLabel="Clear DB"
        tone="danger"
        busy={submitting}
        onCancel={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={() => void onResetConfirmed()}
      />
    </div>
  );
}
