"use client";

import { useEffect, useMemo, useState } from "react";
import TransactionSourceLabel from "@/app/components/transaction-source-label";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { Source, UncategorizedTransactionRow } from "@/lib/types";

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
  const [sourceFilter, setSourceFilter] = useState<"all" | Source>("all");
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
        // `??` skips nullish but not ""; empty draft should still pick up a new GPT suggestion.
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
    const items = filteredRows
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

  const filteredRows = useMemo(
    () =>
      sourceFilter === "all"
        ? rows
        : rows.filter((row) => row.transaction.source === sourceFilter),
    [rows, sourceFilter],
  );
  const suggestedCount = filteredRows.filter((row) => row.suggestion).length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Categorize</h1>
          <p className="text-sm opacity-70 mt-1 max-w-3xl">
            Review uncategorized transactions across every source. Opening this page
            asks GPT for any missing suggestions, then you can accept or override them
            one row at a time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void acceptAllSuggestions()}
            disabled={loading || suggesting || bulkSaving || savingId !== null || suggestedCount === 0}
            className="px-3 py-1.5 text-sm rounded bg-black text-white dark:bg-white dark:text-black disabled:opacity-50"
          >
            {bulkSaving ? "Accepting…" : "Accept all recommendations"}
          </button>
          <button
            type="button"
            onClick={() => void refreshQueue()}
            disabled={loading || suggesting || bulkSaving || savingId !== null}
            className="px-3 py-1.5 text-sm border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
          >
            {loading || suggesting ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Uncategorized" value={filteredRows.length} />
        <Stat label="With suggestion" value={suggestedCount} />
        <Stat label="Manual review" value={filteredRows.length - suggestedCount} />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <SourceFilterButton
          label="All sources"
          active={sourceFilter === "all"}
          onClick={() => setSourceFilter("all")}
        />
        <SourceFilterButton
          label="Credit card"
          active={sourceFilter === "credit_card"}
          onClick={() => setSourceFilter("credit_card")}
        />
        <SourceFilterButton
          label="Venmo"
          active={sourceFilter === "venmo"}
          onClick={() => setSourceFilter("venmo")}
        />
        <SourceFilterButton
          label="Splitwise"
          active={sourceFilter === "splitwise"}
          onClick={() => setSourceFilter("splitwise")}
        />
      </section>

      {(loading || suggesting) && (
        <p className="text-sm opacity-60">
          {loading ? "Loading uncategorized transactions…" : "Generating GPT suggestions…"}
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {notice && <p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>}

      {!loading && filteredRows.length === 0 ? (
        <p className="text-sm opacity-60">No uncategorized transactions right now.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm align-top">
            <thead className="text-left opacity-60">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="pr-4">Source</th>
                <th className="pr-4">Merchant</th>
                <th className="pr-4 text-right">Amount</th>
                <th className="pr-4">Suggestion</th>
                <th className="pr-4">Category</th>
                <th className="pr-4">Reason</th>
                <th className="pr-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const { transaction, suggestion } = row;
                const draft =
                  drafts[transaction.id] ??
                  suggestion?.suggested_category ??
                  "";
                const busy = savingId === transaction.id;
                return (
                  <tr
                    key={transaction.id}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="py-3 pr-4 font-mono whitespace-nowrap">{transaction.date}</td>
                    <td className="pr-4 whitespace-nowrap">
                      <TransactionSourceLabel transaction={transaction} />
                    </td>
                    <td className="pr-4 min-w-40">{transaction.merchant_raw}</td>
                    <td className="pr-4 text-right font-mono whitespace-nowrap">
                      {formatMoney(transaction.amount_total, transaction.currency)}
                    </td>
                    <td className="pr-4 min-w-44">
                      {suggestion ? (
                        <div className="space-y-1">
                          <div className="font-medium">{suggestion.suggested_category}</div>
                          <div className="text-xs opacity-60">
                            {Math.round(suggestion.confidence * 100)}% confidence
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
                      ) : (
                        <span className="text-xs opacity-50">No GPT suggestion yet</span>
                      )}
                    </td>
                    <td className="min-w-56 pr-4">
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
                          className="min-w-44 rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                        >
                          <option value="">Choose a category</option>
                          {CATEGORY_OPTIONS.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy || bulkSaving || !draft}
                          onClick={() => void applyCategory(transaction.id, draft)}
                          className="px-3 py-2 rounded bg-black text-white dark:bg-white dark:text-black text-sm disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </td>
                    <td className="min-w-56 text-xs opacity-70">
                      {suggestion?.reason?.trim() || "—"}
                    </td>
                    <td className="pr-4 min-w-56">
                      <div>{transaction.description?.trim() || "—"}</div>
                      <div className="text-xs opacity-60 mt-1">
                        My share {formatMoney(transaction.amount_my_share, transaction.currency)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-black/10 dark:border-white/10 rounded p-4">
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className="text-2xl font-mono mt-1">{value}</div>
    </div>
  );
}

function SourceFilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded border text-sm ${
        active
          ? "border-black/50 bg-black text-white dark:border-white/50 dark:bg-white dark:text-black"
          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
