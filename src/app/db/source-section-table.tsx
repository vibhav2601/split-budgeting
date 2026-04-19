"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MineOnlyButton from "@/app/mine-only-button";
import type { Source, Transaction } from "@/lib/types";

type SortKey = "date" | "total";
type SortDir = "asc" | "desc";

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
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      const cmp =
        sortKey === "total"
          ? a.amount_total - b.amount_total
          : a.date.localeCompare(b.date) || a.id - b.id;
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
    setSortDir(nextKey === "date" ? "desc" : "desc");
  }

  async function deleteRow(row: Transaction) {
    if (deletingId !== null) return;
    const confirmed = window.confirm(
      `Delete ${row.merchant_raw} on ${row.date}? This cannot be undone.`,
    );
    if (!confirmed) return;

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
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
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
            {sortedRows.map((row) => (
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
                <td className="pr-4 min-w-36">
                  <div className="flex flex-col items-start gap-1">
                    {row.source !== "splitwise" && !row.reconciled ? (
                      <MineOnlyButton
                        transactionId={row.id}
                        mineOnly={Boolean(row.mine_only)}
                        compact
                      />
                    ) : (
                      <span className="text-xs opacity-50">—</span>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteRow(row)}
                      disabled={deletingId === row.id}
                      className="text-sm text-red-600 underline underline-offset-2 disabled:opacity-50 dark:text-red-400"
                    >
                      {deletingId === row.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
                <td className="pr-4 whitespace-nowrap">{row.currency}</td>
                <td className="pr-4 text-right font-mono whitespace-nowrap">
                  ${row.amount_total.toFixed(2)}
                </td>
                <td className="pr-4 text-right font-mono whitespace-nowrap">
                  ${row.amount_my_share.toFixed(2)}
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
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="text-sm opacity-60">No rows remain in this source.</p>
      )}
    </div>
  );
}
