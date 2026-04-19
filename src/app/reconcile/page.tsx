"use client";

import { useCallback, useEffect, useState } from "react";
import type { MergeSuggestion, Transaction } from "@/lib/types";

export default function ReconcilePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reconcile/suggest");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "failed");
      setSuggestions(body.suggestions as MergeSuggestion[]);
      const init: Record<number, Set<number>> = {};
      for (const s of body.suggestions as MergeSuggestion[]) {
        const top = s.candidates[0];
        if (top && top.score >= 0.7) init[s.splitwise_txn.id] = new Set([top.txn.id]);
        else init[s.splitwise_txn.id] = new Set();
      }
      setSelections(init);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(swId: number, otherId: number) {
    setSelections((prev) => {
      const cur = new Set(prev[swId] ?? []);
      if (cur.has(otherId)) cur.delete(otherId);
      else cur.add(otherId);
      return { ...prev, [swId]: cur };
    });
  }

  async function confirm(swId: number) {
    const ids = Array.from(selections[swId] ?? []);
    const res = await fetch("/api/reconcile/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splitwise_txn_id: swId, other_txn_ids: ids }),
    });
    if (res.ok) {
      setSuggestions((prev) => prev.filter((s) => s.splitwise_txn.id !== swId));
    } else {
      setError(await res.text());
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reconcile</h1>
          <p className="text-sm opacity-70 mt-1">
            Each Splitwise entry shows the credit card / Venmo transactions it
            might belong to. Pick the true matches and confirm. Confirming sets
            your true share to the Splitwise amount and flags the others as
            reconciled.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10"
        >
          Refresh
        </button>
      </header>

      {loading && <p className="text-sm opacity-60">Scoring matches…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!loading && !error && suggestions.length === 0 && (
        <p className="text-sm opacity-60">
          Nothing to reconcile. Import more data or all Splitwise entries are
          already matched.
        </p>
      )}

      <div className="space-y-4">
        {suggestions.map((s) => (
          <div
            key={s.splitwise_txn.id}
            className="border border-black/10 dark:border-white/10 rounded p-4 space-y-3"
          >
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="text-xs uppercase opacity-60">Splitwise</div>
                <div className="font-medium">{s.splitwise_txn.merchant_raw}</div>
                <div className="text-sm opacity-70 font-mono">
                  {s.splitwise_txn.date} · total ${s.splitwise_txn.amount_total.toFixed(2)} ·
                  my share ${s.splitwise_txn.amount_my_share.toFixed(2)} ·
                  paid by {s.splitwise_txn.payer}
                </div>
              </div>
              <button
                onClick={() => confirm(s.splitwise_txn.id)}
                className="px-3 py-1.5 text-sm bg-black text-white dark:bg-white dark:text-black rounded hover:opacity-80"
              >
                Confirm merge
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-xs uppercase opacity-60">Candidates</div>
              {s.candidates.length === 0 && (
                <p className="text-sm opacity-60">No matches above threshold.</p>
              )}
              {s.candidates.map((c) => (
                <CandidateRow
                  key={c.txn.id}
                  txn={c.txn}
                  score={c.score}
                  reasons={c.reasons}
                  selected={(selections[s.splitwise_txn.id] ?? new Set()).has(c.txn.id)}
                  onToggle={() => toggle(s.splitwise_txn.id, c.txn.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateRow({
  txn,
  score,
  reasons,
  selected,
  onToggle,
}: {
  txn: Transaction;
  score: number;
  reasons: string[];
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-2 rounded cursor-pointer border ${
        selected
          ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
          : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1">
        <div className="flex justify-between">
          <div className="font-medium">{txn.merchant_raw}</div>
          <div className="font-mono text-sm">${txn.amount_total.toFixed(2)}</div>
        </div>
        <div className="text-xs opacity-70 font-mono">
          {txn.date} · {txn.source} · score {(score * 100).toFixed(0)}%
        </div>
        <div className="text-xs opacity-60">{reasons.join(" · ")}</div>
      </div>
    </label>
  );
}
