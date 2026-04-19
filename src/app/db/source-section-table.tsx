"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/app/components/confirm-dialog";
import MineOnlyButton from "@/app/mine-only-button";
import {
  ReconcileTxnLink,
  TrashIcon,
  txnActionIconButtonClass,
} from "@/app/components/txn-actions";
import type { Source, Transaction } from "@/lib/types";

type SortKey = "date" | "total";
type SortDir = "asc" | "desc";
type StatusFilter = "pending" | "mine_only" | "merged";

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "mine_only", label: "Mine only" },
  { key: "merged", label: "Merged" },
];

const DELETE_CONFIRM_STORAGE_KEY = "split-budgeting:skip-delete-confirm";

function renderValue(value: string | null): string {
  return value && value.trim() ? value : "—";
}

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function statusOf(row: Transaction): StatusFilter {
  if (row.reconciled) return "merged";
  if (row.mine_only) return "mine_only";
  return "pending";
}

export default function SourceSectionTable({
  source,
  initialRows,
}: {
  source: Source;
  initialRows: Transaction[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(
    () => new Set(STATUS_OPTIONS.map((option) => option.key)),
  );
  const [amountDrafts, setAmountDrafts] = useState<Record<number, { total: string; myShare: string }>>(
    () => {
      const next: Record<number, { total: string; myShare: string }> = {};
      for (const row of initialRows) {
        next[row.id] = {
          total: row.amount_total.toFixed(2),
          myShare: row.amount_my_share.toFixed(2),
        };
      }
      return next;
    },
  );
  const [savingAmountId, setSavingAmountId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<Transaction | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setAmountDrafts(() => {
      const next: Record<number, { total: string; myShare: string }> = {};
      for (const row of initialRows) {
        next[row.id] = {
          total: row.amount_total.toFixed(2),
          myShare: row.amount_my_share.toFixed(2),
        };
      }
      return next;
    });
  }, [initialRows]);

  useEffect(() => {
    setSkipDeleteConfirm(window.localStorage.getItem(DELETE_CONFIRM_STORAGE_KEY) === "1");
  }, []);

  const sortedRows = useMemo(() => {
    const ordered = rows
      .filter((row) => statusFilters.has(statusOf(row)))
      .sort((a, b) => {
        const cmp =
          sortKey === "total"
            ? a.amount_total - b.amount_total
            : a.date.localeCompare(b.date) || a.id - b.id;
        return sortDir === "asc" ? cmp : -cmp;
      });
    return ordered;
  }, [rows, statusFilters, sortDir, sortKey]);

  function setSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "date" ? "desc" : "desc");
  }

  function toggleStatusFilter(status: StatusFilter) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function selectAllStatuses() {
    setStatusFilters(new Set(STATUS_OPTIONS.map((option) => option.key)));
  }

  function updateSkipDeleteConfirm(next: boolean) {
    setSkipDeleteConfirm(next);
    window.localStorage.setItem(DELETE_CONFIRM_STORAGE_KEY, next ? "1" : "0");
  }

  async function deleteRow(row: Transaction) {
    if (deletingId !== null || savingAmountId !== null) return;

    setDeletingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/transactions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: row.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "failed");
      setRows((prev) => prev.filter((txn) => txn.id !== row.id));
      setPendingDeleteRow(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function requestDelete(row: Transaction) {
    if (deletingId !== null || savingAmountId !== null) return;
    if (skipDeleteConfirm) {
      void deleteRow(row);
      return;
    }
    setPendingDeleteRow(row);
  }

  async function saveAmounts(row: Transaction, total: string, myShare: string) {
    if (savingAmountId !== null || deletingId !== null) return;
    setSavingAmountId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/transactions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: row.id,
          amount_total: Number(total),
          amount_my_share: Number(myShare),
        }),
      });
      const body = (await res.json()) as { error?: string; transaction?: Transaction };
      if (!res.ok || !body.transaction) {
        throw new Error(body.error ?? "failed");
      }
      const updated = body.transaction;
      setRows((prev) =>
        prev.map((txn) => (txn.id === row.id ? updated : txn)),
      );
      setAmountDrafts((prev) => ({
        ...prev,
        [row.id]: {
          total: updated.amount_total.toFixed(2),
          myShare: updated.amount_my_share.toFixed(2),
        },
      }));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingAmountId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setSort("date")}
              className={`px-3 py-1.5 rounded border ${
                sortKey === "date"
                  ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
                  : "border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              Sort by date {sortKey === "date" ? (sortDir === "desc" ? "↓" : "↑") : ""}
            </button>
            <button
              type="button"
              onClick={() => setSort("total")}
              className={`px-3 py-1.5 rounded border ${
                sortKey === "total"
                  ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
                  : "border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              Sort by price {sortKey === "total" ? (sortDir === "desc" ? "↓" : "↑") : ""}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="opacity-60">Status:</span>
            <button
              type="button"
              onClick={selectAllStatuses}
              className={`px-3 py-1.5 rounded border ${
                statusFilters.size === STATUS_OPTIONS.length
                  ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
                  : "border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {statusFilters.size === STATUS_OPTIONS.length ? "✓ " : ""}
              All
            </button>
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleStatusFilter(option.key)}
                className={`px-3 py-1.5 rounded border ${
                  statusFilters.has(option.key)
                    ? "border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5"
                    : "border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {statusFilters.has(option.key) ? "✓ " : ""}
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm align-top">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="pr-4">Merchant</th>
              <th className="pr-4">Description</th>
              <th className="pr-4">Category</th>
              <th className="pr-4">Payer</th>
              <th className="pr-4">Status</th>
              <th className="pr-4">Action</th>
              <th className="pr-4">Currency</th>
              <th className="pr-4 text-right">Total</th>
              <th className="pr-4 text-right">My share</th>
              <th className="pr-4">External id</th>
              <th>Raw JSON</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const amountDraft = amountDrafts[row.id] ?? {
                total: row.amount_total.toFixed(2),
                myShare: row.amount_my_share.toFixed(2),
              };
              const parsedTotal = Number(amountDraft.total);
              const parsedMyShare = Number(amountDraft.myShare);
              const amountsValid =
                amountDraft.total.trim() !== "" &&
                amountDraft.myShare.trim() !== "" &&
                Number.isFinite(parsedTotal) &&
                Number.isFinite(parsedMyShare) &&
                parsedTotal >= 0 &&
                parsedMyShare >= 0 &&
                parsedMyShare <= parsedTotal + 0.01;
              const amountsChanged =
                amountDraft.total !== row.amount_total.toFixed(2) ||
                amountDraft.myShare !== row.amount_my_share.toFixed(2);
              const amountLocked = Boolean(row.reconciled);
              const amountBusy = savingAmountId === row.id;

              return (
                <tr
                  key={row.id}
                  className="border-t border-black/5 dark:border-white/5"
                >
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">{row.date}</td>
                  <td className="pr-4 min-w-40">{row.merchant_raw}</td>
                  <td className="pr-4 min-w-48">{renderValue(row.description)}</td>
                  <td className="pr-4 whitespace-nowrap">{renderValue(row.category)}</td>
                  <td className="pr-4 whitespace-nowrap">{row.payer}</td>
                  <td className="pr-4 whitespace-nowrap">
                    {row.reconciled ? "merged" : row.mine_only ? "mine only" : "pending"}
                  </td>
                  <td className="pr-4 min-w-44">
                    <div className="flex flex-row flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void saveAmounts(row, amountDraft.total, amountDraft.myShare)}
                        disabled={Boolean(
                          amountBusy || amountLocked || !amountsValid || !amountsChanged || deletingId !== null,
                        )}
                        className="px-3 py-1.5 rounded bg-black text-white dark:bg-white dark:text-black text-sm disabled:opacity-50"
                      >
                        {amountBusy ? "Saving…" : "Save amounts"}
                      </button>
                      {row.source !== "splitwise" && !row.reconciled ? (
                        <>
                          <ReconcileTxnLink transactionId={row.id} />
                          <MineOnlyButton
                            transactionId={row.id}
                            mineOnly={Boolean(row.mine_only)}
                            compact
                            iconOnly
                            autoRefresh={false}
                            onChanged={(nextMineOnly) => {
                              setRows((prev) =>
                                prev.map((txn) =>
                                  txn.id === row.id ? { ...txn, mine_only: nextMineOnly ? 1 : 0 } : txn,
                                ),
                              );
                              startTransition(() => {
                                router.refresh();
                              });
                            }}
                          />
                        </>
                      ) : (
                        <span className="text-xs opacity-50">
                          {row.reconciled ? "Merged rows lock raw amounts." : "—"}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => requestDelete(row)}
                        disabled={Boolean(deletingId === row.id || savingAmountId !== null)}
                        title={deletingId === row.id ? "Deleting…" : "Delete transaction"}
                        aria-label={deletingId === row.id ? "Deleting…" : "Delete transaction"}
                        className={`${txnActionIconButtonClass} text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400`}
                      >
                        <TrashIcon className="size-[1.125rem] shrink-0" />
                      </button>
                    </div>
                  </td>
                  <td className="pr-4 whitespace-nowrap">{row.currency}</td>
                  <td className="pr-4 text-right whitespace-nowrap">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountDraft.total}
                      disabled={Boolean(amountBusy || amountLocked)}
                      onChange={(e) =>
                        setAmountDrafts((prev) => ({
                          ...prev,
                          [row.id]: {
                            ...amountDraft,
                            total: e.target.value,
                          },
                        }))
                      }
                      className="w-28 rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-right font-mono text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="pr-4 text-right whitespace-nowrap">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountDraft.myShare}
                      disabled={Boolean(amountBusy || amountLocked)}
                      onChange={(e) =>
                        setAmountDrafts((prev) => ({
                          ...prev,
                          [row.id]: {
                            ...amountDraft,
                            myShare: e.target.value,
                          },
                        }))
                      }
                      className="w-28 rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-right font-mono text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="pr-4 font-mono text-xs min-w-36">
                    {renderValue(row.external_id)}
                  </td>
                  <td className="min-w-56">
                    {row.raw_json ? (
                      <details>
                        <summary className="cursor-pointer text-xs underline underline-offset-2">
                          View raw JSON
                        </summary>
                        <pre className="mt-2 text-xs p-3 rounded bg-black/5 dark:bg-white/5 overflow-x-auto">
                          {prettyJson(row.raw_json)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs opacity-50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="text-sm opacity-60">No rows remain in this source.</p>
      )}
      {rows.length > 0 && sortedRows.length === 0 && (
        <p className="text-sm opacity-60">No rows match the current filters.</p>
      )}
      <ConfirmDialog
        open={pendingDeleteRow !== null}
        title="Delete transaction?"
        description={
          pendingDeleteRow
            ? `Delete ${pendingDeleteRow.merchant_raw} on ${pendingDeleteRow.date}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        skipFutureLabel="Don't show again"
        skipFutureValue={skipDeleteConfirm}
        onSkipFutureChange={updateSkipDeleteConfirm}
        busy={pendingDeleteRow !== null && deletingId === pendingDeleteRow.id}
        onCancel={() => {
          if (deletingId === null) setPendingDeleteRow(null);
        }}
        onConfirm={() => {
          if (pendingDeleteRow) void deleteRow(pendingDeleteRow);
        }}
      />
    </div>
  );
}
