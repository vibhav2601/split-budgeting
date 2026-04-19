"use client";

import { useEffect, useState } from "react";
import TransactionSourceLabel from "@/app/components/transaction-source-label";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { UncategorizedTransactionRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type UncategorizedResponse = {
  rows?: UncategorizedTransactionRow[];
  error?: string;
};

type SuggestMissingResponse = {
  processed?: number;
  suggested?: number;
  failed_batches?: number;
  errors?: string[];
  error?: string;
};

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function AcceptCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SavingSpinnerIcon({ className }: { className?: string }) {
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

export default function CategorizeClient() {
  const [rows, setRows] = useState<UncategorizedTransactionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadRows() {
    const res = await fetch("/api/categories/uncategorized");
    const body = (await res.json()) as UncategorizedResponse;
    if (!res.ok) throw new Error(body.error ?? "Failed to load uncategorized transactions.");
    const nextRows = body.rows ?? [];
    setRows(nextRows);
    setDrafts((prev) => {
      const next: Record<number, string> = {};
      for (const row of nextRows) {
        const id = row.transaction.id;
        const prevVal = prev[id];
        const suggested = row.suggestion?.suggested_category ?? "";
        next[id] =
          prevVal !== undefined && prevVal !== "" ? prevVal : suggested;
      }
      return next;
    });
  }

  async function refreshQueue() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await loadRows();
      setSuggesting(true);
      const res = await fetch("/api/categories/suggest-missing", { method: "POST" });
      const body = (await res.json()) as SuggestMissingResponse;
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to generate category suggestions.");
      }
      if ((body.suggested ?? 0) > 0) {
        await loadRows();
      }
      if ((body.failed_batches ?? 0) > 0) {
        setNotice(
          `Saved ${body.suggested ?? 0} suggestions. ${body.failed_batches} suggestion batch failed.`,
        );
      } else if ((body.suggested ?? 0) > 0) {
        setNotice(`Saved ${body.suggested} new GPT suggestion${body.suggested === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshQueue();
  }, []);

  async function applyCategory(transactionId: number, category: string) {
    setSavingId(transactionId);
    setError(null);
    try {
      const res = await fetch("/api/categories/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: transactionId, category }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to apply category.");
      setRows((prev) => prev.filter((row) => row.transaction.id !== transactionId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[transactionId];
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function acceptAllSuggestions() {
    const items = rows
      .filter((row) => row.suggestion)
      .map((row) => ({
        transaction_id: row.transaction.id,
        category: row.suggestion!.suggested_category,
      }));
    if (items.length === 0) return;

    setBulkSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/categories/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = (await res.json()) as { error?: string; applied?: number };
      if (!res.ok) throw new Error(body.error ?? "Failed to apply suggested categories.");
      const appliedIds = new Set(items.map((item) => item.transaction_id));
      setRows((prev) => prev.filter((row) => !appliedIds.has(row.transaction.id)));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          delete next[item.transaction_id];
        }
        return next;
      });
      setNotice(`Accepted ${body.applied ?? items.length} recommendation${items.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkSaving(false);
    }
  }

  const suggestedCount = rows.filter((row) => row.suggestion).length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorize</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Review uncategorized transactions. Opening this page asks GPT for missing suggestions,
            then you can accept or override them one by one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void acceptAllSuggestions()}
            disabled={loading || suggesting || bulkSaving || savingId !== null || suggestedCount === 0}
          >
            {bulkSaving ? "Accepting…" : "Accept all recommendations"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void refreshQueue()}
            disabled={loading || suggesting || bulkSaving || savingId !== null}
          >
            {loading || suggesting ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <StatCard label="Uncategorized" value={rows.length} />
        <StatCard label="With suggestion" value={suggestedCount} />
        <StatCard label="Manual review" value={rows.length - suggestedCount} />
      </section>

      {(loading || suggesting) && (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading uncategorized transactions…" : "Generating GPT suggestions…"}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>}

      {!loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No uncategorized transactions right now.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const { transaction, suggestion } = row;
            const draft =
              drafts[transaction.id] ??
              suggestion?.suggested_category ??
              "";
            const busy = savingId === transaction.id;

            return (
              <Card key={transaction.id} className="py-3">
                <CardContent className="flex items-center gap-4 flex-wrap">
                  {/* Left: merchant + date + source */}
                  <div className="flex-1 min-w-40 space-y-0.5">
                    <div className="font-medium">{transaction.merchant_raw}</div>
                    <div className="text-xs text-muted-foreground font-mono tabular-nums">
                      {transaction.date} · <TransactionSourceLabel transaction={transaction} />
                    </div>
                    {transaction.description?.trim() && (
                      <div className="text-xs text-muted-foreground">{transaction.description.trim()}</div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="font-mono tabular-nums text-sm font-medium whitespace-nowrap">
                    {formatMoney(transaction.amount_total, transaction.currency)}
                  </div>

                  {/* Suggestion */}
                  {suggestion && (
                    <div className="flex items-center gap-2">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{suggestion.suggested_category}</div>
                        <div className="text-xs text-muted-foreground">
                          {Math.round(suggestion.confidence * 100)}% confidence
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy || bulkSaving}
                        onClick={() =>
                          void applyCategory(transaction.id, suggestion.suggested_category)
                        }
                        title={busy ? "Saving…" : "Accept suggestion"}
                        aria-label={busy ? "Saving suggestion…" : "Accept suggestion"}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-600/35 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 dark:border-emerald-400/40 dark:text-emerald-400 dark:hover:bg-emerald-400/10"
                      >
                        {busy ? (
                          <SavingSpinnerIcon className="size-[1.125rem] animate-spin" />
                        ) : (
                          <AcceptCheckIcon className="size-[1.125rem]" />
                        )}
                      </button>
                    </div>
                  )}
                  {!suggestion && (
                    <Badge variant="outline" className="whitespace-nowrap text-muted-foreground">
                      No suggestion yet
                    </Badge>
                  )}

                  {/* Category selector */}
                  <div className="flex items-center gap-2">
                    <select
                      value={draft}
                      disabled={busy || bulkSaving}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [transaction.id]: e.target.value,
                        }))
                      }
                      className="min-w-44 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="">Choose a category</option>
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={busy || bulkSaving || !draft}
                      onClick={() => void applyCategory(transaction.id, draft)}
                    >
                      {busy ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-mono tabular-nums font-semibold tracking-tight mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
