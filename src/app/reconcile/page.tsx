"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import TransactionSourceLabel from "@/app/components/transaction-source-label";
import MineOnlyButton from "@/app/mine-only-button";
import MergeConfirmButton from "@/app/reconcile/merge-confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MergeSuggestion, ReconcileSuggestResponse, Transaction } from "@/lib/types";

function ReconcileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border pb-3 mb-2">
      <Link
        href="/reconcile"
        className={cn(
          "px-3 py-1.5 text-sm rounded-md transition-colors",
          pathname === "/reconcile"
            ? "bg-muted font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/70",
        )}
      >
        Queue
      </Link>
      <Link
        href="/reconcile/search"
        className={cn(
          "px-3 py-1.5 text-sm rounded-md transition-colors",
          pathname.startsWith("/reconcile/search")
            ? "bg-muted font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/70",
        )}
      >
        Search
      </Link>
    </nav>
  );
}

export default function ReconcilePage() {
  return (
    <Suspense fallback={<ReconcilePageFallback />}>
      <ReconcilePageContent />
    </Suspense>
  );
}

function ReconcilePageFallback() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Splitwise Reconcile</h1>
      </header>
      <ReconcileNav />
      <p className="text-sm text-muted-foreground">Loading Splitwise reconcile queue…</p>
    </div>
  );
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
          <h1 className="text-2xl font-semibold tracking-tight">Splitwise Reconcile</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Each Splitwise entry shows the credit card / Venmo transactions it
            might belong to. Pick the true matches and confirm.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          Refresh
        </Button>
      </header>

      <ReconcileNav />

      {focusTxn && (
        <Card>
          <CardContent className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Focused transaction</div>
              <div className="font-medium mt-1">{focusTxn.merchant_raw}</div>
              <div className="text-sm text-muted-foreground font-mono tabular-nums">
                {focusTxn.date} · <TransactionSourceLabel transaction={focusTxn} /> · total ${focusTxn.amount_total.toFixed(2)} ·
                my share ${focusTxn.amount_my_share.toFixed(2)}
              </div>
            </div>
            <Link href="/reconcile" className="text-sm underline whitespace-nowrap">
              Back to full queue
            </Link>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">Scoring matches…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && focusTxn && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Splitwise candidates were found for this transaction. Try the{" "}
          <Link href="/reconcile" className="underline">
            full queue
          </Link>
          .
        </p>
      )}
      {!loading && !error && !focusTxn && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing to reconcile. Import more data or all Splitwise entries are already matched.
        </p>
      )}

      <div className="space-y-4">
        {suggestions.map((s) => (
          <Card key={s.splitwise_txn.id}>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide">Splitwise</div>
                  <div className="font-medium mt-1">{s.splitwise_txn.merchant_raw}</div>
                  <div className="text-sm text-muted-foreground font-mono tabular-nums">
                    {s.splitwise_txn.date} · total ${s.splitwise_txn.amount_total.toFixed(2)} ·
                    my share ${s.splitwise_txn.amount_my_share.toFixed(2)} ·
                    paid by {s.splitwise_txn.payer}
                  </div>
                </div>
                <div className="flex items-start gap-2 flex-wrap">
                  {s.candidates.find((candidate) => candidate.txn.id === selections[s.splitwise_txn.id]) ? (
                    <MergeConfirmButton
                      splitwiseTxn={s.splitwise_txn}
                      matchedTxn={s.candidates.find(
                        (candidate) => candidate.txn.id === selections[s.splitwise_txn.id],
                      )!.txn}
                      label="Confirm merge"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
                      onMerged={() => dismiss(s.splitwise_txn.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setError("Select one candidate before confirming the merge.")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
                    >
                      Confirm merge
                    </button>
                  )}
                  <Link
                    href={`/reconcile/search?splitwise_txn_id=${s.splitwise_txn.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Search credit cards
                  </Link>
                  <button
                    onClick={() => dismiss(s.splitwise_txn.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    Deny merge
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase text-muted-foreground tracking-wide">Candidates</div>
                {s.candidates.length === 0 && (
                  <p className="text-sm text-muted-foreground">No matches above threshold.</p>
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
            </CardContent>
          </Card>
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
      className={cn(
        "flex items-start gap-3 p-2.5 rounded-md cursor-pointer border transition-colors",
        selected
          ? "border-primary/40 bg-muted"
          : focused
            ? "border-border bg-muted/50"
            : "border-transparent hover:bg-muted/50",
      )}
    >
      <input
        type="radio"
        name={`candidate-${splitwiseTxnId}`}
        checked={selected}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1">
        <div className="flex justify-between items-start gap-2">
          <div className="font-medium text-sm">
            {txn.merchant_raw}
            {focused && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                selected from dashboard
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="font-mono tabular-nums">
              {(score * 100).toFixed(0)}%
            </Badge>
            <div className="font-mono tabular-nums text-sm">${txn.amount_total.toFixed(2)}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
          {txn.date} · <TransactionSourceLabel transaction={txn} />
        </div>
        {reasons.length > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">{reasons.join(" · ")}</div>
        )}
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
