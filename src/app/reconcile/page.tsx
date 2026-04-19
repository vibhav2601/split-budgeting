"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useDeferredValue, useEffect, useState } from "react";
import MineOnlyButton from "@/app/mine-only-button";
import type { MergeSuggestion, ReconcileSuggestResponse, Transaction } from "@/lib/types";

export default function ReconcilePage() {
  return (
    <Suspense fallback={<ReconcilePageFallback />}>
      <ReconcilePageContent />
    </Suspense>
  );
}

function ReconcilePageFallback() {
  return <p className="text-sm opacity-60">Loading reconcile queue…</p>;
}

function ReconcilePageContent() {
  const searchParams = useSearchParams();
  const focusTxnId = searchParams.get("txn_id");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [focusTxn, setFocusTxn] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

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
      const init: Record<number, Set<number>> = {};
      for (const s of body.suggestions as MergeSuggestion[]) {
        const focusedCandidate = body.focus_txn
          ? s.candidates.find((c) => c.txn.id === body.focus_txn?.id)
          : null;
        const top = s.candidates[0];
        if (focusedCandidate) init[s.splitwise_txn.id] = new Set([focusedCandidate.txn.id]);
        else if (top && top.score >= 0.7) init[s.splitwise_txn.id] = new Set([top.txn.id]);
        else init[s.splitwise_txn.id] = new Set();
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

  function toggle(swId: number, otherId: number) {
    setSelections((prev) => {
      const cur = new Set(prev[swId] ?? []);
      if (cur.has(otherId)) cur.delete(otherId);
      else cur.add(otherId);
      return { ...prev, [swId]: cur };
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

  async function confirm(swId: number) {
    const ids = Array.from(selections[swId] ?? []);
    const res = await fetch("/api/reconcile/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splitwise_txn_id: swId, other_txn_ids: ids }),
    });
    if (res.ok) {
      dismiss(swId);
    } else {
      setError(await res.text());
    }
  }

  const normalizedSearch = normalizeSearchText(deferredSearch);
  const filteredSuggestions = suggestions
    .map((suggestion) => {
      if (!normalizedSearch) return suggestion;
      const splitwiseMatches = transactionMatchesSearch(suggestion.splitwise_txn, normalizedSearch);
      const candidates = splitwiseMatches
        ? suggestion.candidates
        : suggestion.candidates.filter((candidate) =>
            candidateMatchesSearch(candidate, normalizedSearch),
          );
      if (!splitwiseMatches && candidates.length === 0) return null;
      return { ...suggestion, candidates };
    })
    .filter((suggestion): suggestion is MergeSuggestion => suggestion !== null);

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

      <section className="flex flex-col gap-2">
        <label htmlFor="reconcile-search" className="text-sm font-medium">
          Search transactions
        </label>
        <div className="flex items-center gap-2">
          <input
            id="reconcile-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Merchant, date, amount, category, source, or reason"
            className="w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="px-3 py-2 text-sm rounded border border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs opacity-60">
          Showing {filteredSuggestions.length} of {suggestions.length} Splitwise entries.
        </p>
      </section>

      {focusTxn && (
        <section className="border border-black/10 dark:border-white/10 rounded p-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase opacity-60">Focused transaction</div>
            <div className="font-medium">{focusTxn.merchant_raw}</div>
            <div className="text-sm opacity-70 font-mono">
              {focusTxn.date} · {focusTxn.source} · total ${focusTxn.amount_total.toFixed(2)} ·
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
      {!loading && !error && suggestions.length > 0 && filteredSuggestions.length === 0 && (
        <p className="text-sm opacity-60">
          No reconcile results match your search.
        </p>
      )}

      <div className="space-y-4">
        {filteredSuggestions.map((s) => (
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
                  txn={c.txn}
                  score={c.score}
                  reasons={c.reasons}
                  focused={focusTxn?.id === c.txn.id}
                  selected={(selections[s.splitwise_txn.id] ?? new Set()).has(c.txn.id)}
                  onToggle={() => toggle(s.splitwise_txn.id, c.txn.id)}
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

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function transactionMatchesSearch(txn: Transaction, query: string): boolean {
  return normalizeSearchText(
    [
      txn.merchant_raw,
      txn.description ?? "",
      txn.category ?? "",
      txn.date,
      txn.source,
      txn.payer,
      txn.amount_total.toFixed(2),
      txn.amount_my_share.toFixed(2),
    ].join(" "),
  ).includes(query);
}

function candidateMatchesSearch(
  candidate: MergeSuggestion["candidates"][number],
  query: string,
): boolean {
  if (transactionMatchesSearch(candidate.txn, query)) return true;
  return normalizeSearchText(
    `${candidate.reasons.join(" ")} ${(candidate.score * 100).toFixed(0)}`,
  ).includes(query);
}

function CandidateRow({
  txn,
  score,
  reasons,
  focused,
  selected,
  onToggle,
  onMineOnly,
}: {
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
        type="checkbox"
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
          {txn.date} · {txn.source} · score {(score * 100).toFixed(0)}%
        </div>
        <div className="text-xs opacity-60">{reasons.join(" · ")}</div>
      </div>
      <MineOnlyButton
        transactionId={txn.id}
        mineOnly={Boolean(txn.mine_only)}
        compact
        autoRefresh={false}
        onChanged={onMineOnly}
      />
    </div>
  );
}
