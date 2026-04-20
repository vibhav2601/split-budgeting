"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_MONTHLY_EXPORT_COLUMN_IDS,
  MONTHLY_EXPORT_COLUMNS,
  sortMonthlyExportColumnIds,
  type MonthlyExportColumnId,
} from "@/lib/export-columns";

function buildDownloadHref(month: string, columns: readonly MonthlyExportColumnId[]): string {
  const params = new URLSearchParams({
    month,
    columns: columns.join(","),
  });
  return `/api/export/monthly?${params.toString()}`;
}

export default function MonthlyExportControls({ month }: { month: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<MonthlyExportColumnId[]>(
    DEFAULT_MONTHLY_EXPORT_COLUMN_IDS,
  );

  const orderedSelectedColumns = useMemo(
    () => sortMonthlyExportColumnIds(selectedColumns),
    [selectedColumns],
  );

  function toggleColumn(columnId: MonthlyExportColumnId) {
    setSelectedColumns((current) => {
      if (current.includes(columnId)) {
        return current.filter((id) => id !== columnId);
      }
      return sortMonthlyExportColumnIds([...current, columnId]);
    });
  }

  function resetDefaults() {
    setSelectedColumns(DEFAULT_MONTHLY_EXPORT_COLUMN_IDS);
  }

  function selectAll() {
    setSelectedColumns(MONTHLY_EXPORT_COLUMNS.map((column) => column.id));
  }

  function downloadCsv() {
    if (orderedSelectedColumns.length === 0) return;
    window.location.assign(buildDownloadHref(month, orderedSelectedColumns));
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-tight text-muted-foreground uppercase">
            Export
          </h2>
          <p className="text-sm text-muted-foreground">
            Download finalized rows for {month}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen((open) => !open)}
          >
            {pickerOpen ? "Hide columns" : `Choose columns (${orderedSelectedColumns.length})`}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={downloadCsv}
            disabled={orderedSelectedColumns.length === 0}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {pickerOpen ? (
        <div className="rounded-xl border border-black/10 bg-card p-4 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Choose which normalized fields appear in the export.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetDefaults}>
                Reset defaults
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MONTHLY_EXPORT_COLUMNS.map((column) => {
              const checked = orderedSelectedColumns.includes(column.id);
              return (
                <label
                  key={column.id}
                  className="flex items-center gap-3 rounded-lg border border-black/5 px-3 py-2 text-sm dark:border-white/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleColumn(column.id)}
                    className="size-4"
                  />
                  <span>{column.label}</span>
                </label>
              );
            })}
          </div>

          {orderedSelectedColumns.length === 0 ? (
            <p className="mt-3 text-sm text-red-500">
              Select at least one column to export.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
