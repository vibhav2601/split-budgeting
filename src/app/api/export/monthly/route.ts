import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  loadMonthlyExportRows,
  type MonthlyExportRow,
} from "@/lib/expense-summary";
import {
  MONTHLY_EXPORT_COLUMNS,
  isMonthlyExportColumnId,
  sortMonthlyExportColumnIds,
  type MonthlyExportColumnId,
} from "@/lib/export-columns";

export const runtime = "nodejs";

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parseColumns(value: string | null): MonthlyExportColumnId[] | null {
  if (!value) return null;
  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parsed.length === 0) return null;
  if (!parsed.every(isMonthlyExportColumnId)) return null;
  return sortMonthlyExportColumnIds(parsed);
}

function formatCell(row: MonthlyExportRow, column: MonthlyExportColumnId): string {
  switch (column) {
    case "date":
      return row.date;
    case "category":
      return row.category;
    case "merchant":
      return row.merchant;
    case "description":
      return row.description;
    case "source":
      return row.source;
    case "final_amount":
      return row.final_amount.toFixed(2);
    case "original_amount":
      return row.original_amount.toFixed(2);
    case "my_share":
      return row.my_share.toFixed(2);
    case "payer":
      return row.payer;
    case "status":
      return row.status;
    case "transaction_ids":
      return row.transaction_ids;
    case "merge_group_id":
      return row.merge_group_id === null ? "" : String(row.merge_group_id);
  }
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  const columns = parseColumns(req.nextUrl.searchParams.get("columns"));

  if (!isValidMonth(month)) {
    return NextResponse.json({ error: "invalid month" }, { status: 400 });
  }
  if (!columns || columns.length === 0) {
    return NextResponse.json({ error: "invalid columns" }, { status: 400 });
  }

  const rows = loadMonthlyExportRows(db(), month);
  const columnLabels = new Map(
    MONTHLY_EXPORT_COLUMNS.map((column) => [column.id, column.label]),
  );

  const header = columns.map((column) => escapeCsv(columnLabels.get(column) ?? column));
  const dataLines = rows.map((row) =>
    columns
      .map((column) => escapeCsv(formatCell(row, column)))
      .join(",")
  );
  const csv = [header.join(","), ...dataLines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
