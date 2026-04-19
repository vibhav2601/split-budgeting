import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadMonthlyTrueSpendRows } from "@/lib/expense-summary";
import type { Transaction } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const d = db();
  const rows = d
    .prepare(
      `SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 500`,
    )
    .all() as Transaction[];

  const monthly = loadMonthlyTrueSpendRows(d);

  const totals = d
    .prepare(
      `SELECT
         COUNT(*) AS total_txns,
         SUM(CASE WHEN reconciled = 1 THEN 1 ELSE 0 END) AS reconciled,
         SUM(CASE WHEN reconciled = 0 AND mine_only = 0 THEN 1 ELSE 0 END) AS pending
       FROM transactions`,
    )
    .get() as { total_txns: number; reconciled: number; pending: number };

  return NextResponse.json({ transactions: rows, monthly, totals });
}
