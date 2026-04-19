"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import TransactionSourceLabel from "@/app/components/transaction-source-label";
import MineOnlyButton from "@/app/mine-only-button";
import MergeConfirmButton from "@/app/reconcile/merge-confirm-button";
import type { MergeSuggestion, ReconcileSuggestResponse, Transaction } from "@/lib/types";

export default function ReconcilePage() {
  return (
    <Suspense fallback={<ReconcilePageFallback />}>
      <ReconcilePageContent />
    </Suspense>
  );
}

function ReconcilePageFallback() {
  return <p className="text-sm opacity-60">Loading Splitwise reconcile queue…</p>;
}

function ReconcilePageContent() {
  const searchParams = useSearchParams();
  const focusTxnId = searchParams.get("txn_id");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [selections, setSelections] = useState<Record<number, number | null>>({});
  const [focusTxn, setFocusTxn] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = focusTxnId ? `?txn_id=${encodeURIComponent(focusTxnId)}` : "";
      const res = await fetch(`/api/reconcile/suggest${qs}`);
      const body = (await res.json()) as ReconcileSuggestResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "failed");
      setSuggestions(body.suggestions as MergeSuggestion[]);
      setFocusTxn(body.focus_txn ?? null);
      const init: Record<number, number | null> = {};
      for (const s of body.suggestions as MergeSuggestion[]) {
        const focusedCandidate = body.focus_txn
          ? s.candidates.find((c) => c.txn.id === body.focus_txn?.id)
          : null;
        const top = s.candidates[0];
        if (focusedCandidate) init[s.splitwise_txn.id] = focusedCandidate.txn.id;
        else if (top && top.score >= 0.7) init[s.splitwise_txn.id] = top.txn.id;
        else init[s.splitwise_txn.id] = null;
      }
      setSelections(init);
    } catch (e) {
      setError((e as Error).message);
      setFocusTxn(null);
    } finally {
      setLoading(false);
    }
  }, [focusTxnId]);

  useEffect(() => {
    load();
  }, [load]);

  function selectCandidate(swId: number, otherId: number) {
    setSelections((prev) => {
      const current = prev[swId] ?? null;
      return { ...prev, [swId]: current === otherId ? null : otherId };
    });
  }

  function dismiss(swId: number) {
    setSuggestions((prev) => prev.filter((s) => s.splitwise_txn.id !== swId));
    setSelections((prev) => {
      if (!(swId in prev)) return prev;
      const next = { ...prev };
      delete next[swId];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Splitwise Reconcile</h1>
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

      {focusTxn && (
        <section className="border border-black/10 dark:border-white/10 rounded p-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase opacity-60">Focused transaction</div>
            <div className="font-medium">{focusTxn.merchant_raw}</div>
            <div className="text-sm opacity-70 font-mono">
              {focusTxn.date} · <TransactionSourceLabel transaction={focusTxn} /> · total ${focusTxn.amount_total.toFixed(2)} ·
              my share ${focusTxn.amount_my_share.toFixed(2)}
            </div>
          </div>
          <Link href="/reconcile" className="text-sm underline whitespace-nowrap">
            Back to full queue
          </Link>
        </section>
      )}

      {loading && <p className="text-sm opacity-60">Scoring matches…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!loading && !error && focusTxn && suggestions.length === 0 && (
        <p className="text-sm opacity-60">
          No Splitwise candidates were found for this transaction. Try the{" "}
          <Link href="/reconcile" className="underline">
            full queue
          </Link>
          .
        </p>
      )}
      {!loading && !error && !focusTxn && suggestions.length === 0 && (
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
              <div className="flex items-start gap-2">
                {s.candidates.find((candidate) => candidate.txn.id === selections[s.splitwise_txn.id]) ? (
                  <MergeConfirmButton
                    splitwiseTxn={s.splitwise_txn}
                    matchedTxn={s.candidates.find(
                      (candidate) => candidate.txn.id === selections[s.splitwise_txn.id],
                    )!.txn}
                    label="Confirm merge"
                    className="px-3 py-1.5 text-sm bg-black text-white dark:bg-white dark:text-black rounded hover:opacity-80"
                    onMerged={() => dismiss(s.splitwise_txn.id)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setError("Select one candidate before confirming the merge.")}
                    className="px-3 py-1.5 text-sm bg-black text-white dark:bg-white dark:text-black rounded hover:opacity-80"
                  >
                    Confirm merge
                  </button>
                )}
              </div>
              <Link
                href={`/reconcile/search?splitwise_txn_id=${s.splitwise_txn.id}`}
                className="px-3 py-1.5 text-sm border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                Search credit cards to merge
              </Link>
              <button
                onClick={() => dismiss(s.splitwise_txn.id)}
                className="px-3 py-1.5 text-sm border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10"
              >
                Deny merge
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
                  splitwiseTxnId={s.splitwise_txn.id}
                  txn={c.txn}
                  score={c.score}
                  reasons={c.reasons}
                  focused={focusTxn?.id === c.txn.id}
                  selected={selections[s.splitwise_txn.id] === c.txn.id}
                  onToggle={() => selectCandidate(s.splitwise_txn.id, c.txn.id)}
                  onMineOnly={load}
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
  splitwiseTxnId,
  txn,
  score,
  reasons,
  focused,
  selected,
  onToggle,
  onMineOnly,
}: {
  splitwiseTxnId: number;
  txn: Transaction;
  score: number;
  reasons: string[];
  focused: boolean;
  selected: boolean;
  onToggle: () => void;
  onMineOnly: () => void | Promise<void>;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-2 rounded cursor-pointer border ${
        selected
          ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
          : focused
            ? "border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5"
          : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      <input
        type="radio"
        name={`candidate-${splitwiseTxnId}`}
        checked={selected}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1">
        <div className="flex justify-between">
          <div className="font-medium">
            {txn.merchant_raw}
            {focused && (
              <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">
                selected from dashboard
              </span>
            )}
          </div>
          <div className="font-mono text-sm">${txn.amount_total.toFixed(2)}</div>
        </div>
        <div className="text-xs opacity-70 font-mono">
          {txn.date} · <TransactionSourceLabel transaction={txn} /> · score {(score * 100).toFixed(0)}%
        </div>
        <div className="text-xs opacity-60">{reasons.join(" · ")}</div>
      </div>
      <MineOnlyButton
        transactionId={txn.id}
        mineOnly={Boolean(txn.mine_only)}
        compact
        iconOnly
        autoRefresh={false}
        onChanged={onMineOnly}
      />
    </div>
  );
}
