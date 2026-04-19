import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Transaction } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const d = db();
  const rows = d
    .prepare(
      `SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 500`,
    )
    .all() as Transaction[];

  type Row = { month: string; category: string | null; true_spend: number };
  const monthly = d
    .prepare(
      `SELECT
         substr(date, 1, 7) AS month,
         COALESCE(category, 'Uncategorized') AS category,
         SUM(
           CASE
             WHEN source = 'splitwise' THEN amount_my_share
             WHEN source = 'credit_card' AND reconciled = 0 THEN amount_my_share
             WHEN source = 'venmo' AND reconciled = 0 AND payer = 'me' THEN amount_my_share
             ELSE 0
           END
         ) AS true_spend
       FROM transactions
       GROUP BY month, category
       ORDER BY month DESC, true_spend DESC`,
    )
    .all() as Row[];

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
