"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/app/components/confirm-dialog";
import TransactionSourceLabel from "@/app/components/transaction-source-label";
import {
  ReconcileTxnLink,
  ReimbursementTxnLink,
  SplitwiseSearchTxnLink,
} from "@/app/components/txn-actions";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { Transaction } from "@/lib/types";

function renderValue(value: string | null): string {
  return value && value.trim() ? value : "—";
}

const DELETE_CONFIRM_STORAGE_KEY = "split-budgeting:skip-delete-confirm";

type SortKey =
  | "date"
  | "source"
  | "merchant"
  | "description"
  | "total"
  | "my_share"
  | "status"
  | "merge"
  | "category"
  | "delete";

type SortDir = "asc" | "desc";

export default function CategoryTransactionsTable({
  initialRows,
  pageCategory,
}: {
  initialRows: Transaction[];
  pageCategory: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<number, string>>(() => {
    const next: Record<number, string> = {};
    for (const row of initialRows) {
      next[row.id] = row.category?.trim() || "";
    }
    return next;
  });
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<Transaction | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSkipDeleteConfirm(window.localStorage.getItem(DELETE_CONFIRM_STORAGE_KEY) === "1");
  }, []);

  const sortedRows = useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      const categoryA = a.category?.trim() || "";
      const categoryB = b.category?.trim() || "";
      const descriptionA = a.description?.trim() || "";
      const descriptionB = b.description?.trim() || "";
      const statusA = a.reconciled ? "merged" : a.mine_only ? "mine only" : "pending";
      const statusB = b.reconciled ? "merged" : b.mine_only ? "mine only" : "pending";
      const mergeA = a.source === "splitwise" && !a.reconciled
        ? "splitwise-search"
        : a.source !== "splitwise" && !a.reconciled
          ? a.source === "credit_card"
            ? "reconcile-reimbursement"
            : "reconcile"
          : "";
      const mergeB = b.source === "splitwise" && !b.reconciled
        ? "splitwise-search"
        : b.source !== "splitwise" && !b.reconciled
          ? b.source === "credit_card"
            ? "reconcile-reimbursement"
            : "reconcile"
          : "";
      const deleteA = "delete";
      const deleteB = "delete";
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = a.date.localeCompare(b.date) || a.id - b.id;
          break;
        case "source":
          cmp = a.source.localeCompare(b.source) || a.id - b.id;
          break;
        case "merchant":
          cmp = a.merchant_raw.localeCompare(b.merchant_raw) || a.id - b.id;
          break;
        case "description":
          cmp = descriptionA.localeCompare(descriptionB) || a.id - b.id;
          break;
        case "total":
          cmp = a.amount_total - b.amount_total || a.id - b.id;
          break;
        case "my_share":
          cmp = a.amount_my_share - b.amount_my_share || a.id - b.id;
          break;
        case "status":
          cmp = statusA.localeCompare(statusB) || a.id - b.id;
          break;
        case "merge":
          cmp = mergeA.localeCompare(mergeB) || a.id - b.id;
          break;
        case "category":
          cmp = categoryA.localeCompare(categoryB) || a.id - b.id;
          break;
        case "delete":
          cmp = deleteA.localeCompare(deleteB) || a.id - b.id;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return ordered;
  }, [rows, sortDir, sortKey]);

  function setSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "date" || nextKey === "total" || nextKey === "my_share" ? "desc" : "asc");
  }

  function updateSkipDeleteConfirm(next: boolean) {
    setSkipDeleteConfirm(next);
    window.localStorage.setItem(DELETE_CONFIRM_STORAGE_KEY, next ? "1" : "0");
  }

  async function applyCategory(row: Transaction, category: string) {
    setSavingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/categories/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: row.id, category }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to update category.");

      if (category !== pageCategory) {
        setRows((prev) => prev.filter((txn) => txn.id !== row.id));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      } else {
        setRows((prev) =>
          prev.map((txn) => (txn.id === row.id ? { ...txn, category } : txn)),
        );
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: Transaction) {
    if (deletingId !== null) return;

    setDeletingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/transactions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: row.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to delete transaction.");
      setRows((prev) => prev.filter((txn) => txn.id !== row.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setPendingDeleteRow(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function requestDelete(row: Transaction) {
    if (deletingId !== null) return;
    if (skipDeleteConfirm) {
      void deleteRow(row);
      return;
    }
    setPendingDeleteRow(row);
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm opacity-60">No transactions remain in this month/category.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
          <table className="w-full text-sm align-top">
            <thead className="text-left opacity-60">
              <tr>
                <th className="py-2 px-3"><SortButton label="Date" sortKey="date" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3"><SortButton label="Source" sortKey="source" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3"><SortButton label="Merchant" sortKey="merchant" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3"><SortButton label="Description" sortKey="description" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3 text-right"><SortButton label="Total" sortKey="total" activeKey={sortKey} sortDir={sortDir} onClick={setSort} align="right" /></th>
                <th className="px-3 text-right"><SortButton label="My share" sortKey="my_share" activeKey={sortKey} sortDir={sortDir} onClick={setSort} align="right" /></th>
                <th className="px-3"><SortButton label="Status" sortKey="status" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3"><SortButton label="Merge" sortKey="merge" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3"><SortButton label="Category" sortKey="category" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
                <th className="px-3"><SortButton label="Delete" sortKey="delete" activeKey={sortKey} sortDir={sortDir} onClick={setSort} /></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const busy = savingId === row.id || deletingId === row.id;
                const draft = drafts[row.id] ?? row.category ?? "";
                return (
                  <tr
                    key={row.id}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="py-2 px-3 font-mono whitespace-nowrap">{row.date}</td>
                    <td className="px-3 whitespace-nowrap">
                      <TransactionSourceLabel transaction={row} />
                    </td>
                    <td className="px-3 min-w-40">{row.merchant_raw}</td>
                    <td className="px-3 min-w-64">{renderValue(row.description)}</td>
                    <td className="px-3 text-right font-mono whitespace-nowrap">
                      ${row.amount_total.toFixed(2)}
                    </td>
                    <td className="px-3 text-right font-mono whitespace-nowrap">
                      ${row.amount_my_share.toFixed(2)}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      {row.reconciled ? "merged" : row.mine_only ? "mine only" : "pending"}
                    </td>
                    <td className="px-3">
                      <div className="flex flex-row items-center gap-1">
                        {row.source === "splitwise" && !row.reconciled ? (
                          <SplitwiseSearchTxnLink transactionId={row.id} />
                        ) : row.source !== "splitwise" && !row.reconciled ? (
                          <>
                            <ReconcileTxnLink transactionId={row.id} />
                            {row.source === "credit_card" && (
                              <ReimbursementTxnLink transactionId={row.id} />
                            )}
                          </>
                        ) : (
                          <span className="text-xs opacity-50">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 min-w-72 whitespace-nowrap">
                      <div className="flex flex-row items-center gap-2 whitespace-nowrap">
                        <select
                          value={draft}
                          disabled={busy}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          className="w-52 rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
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
                          disabled={busy || !draft || draft === (row.category ?? "")}
                          onClick={() => void applyCategory(row, draft)}
                          className="px-3 py-2 rounded bg-black text-white dark:bg-white dark:text-black text-sm disabled:opacity-50"
                        >
                          {savingId === row.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => requestDelete(row)}
                        disabled={busy}
                        className="text-sm text-red-600 underline underline-offset-2 disabled:opacity-50 dark:text-red-400"
                      >
                        {deletingId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

function SortButton({
  label,
  sortKey,
  activeKey,
  sortDir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""}`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">{active ? (sortDir === "desc" ? "↓" : "↑") : ""}</span>
    </button>
  );
}
