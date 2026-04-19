import { NextResponse } from "next/server";
import { db, getSetting, setSetting } from "@/lib/db";
import {
  fetchExpenses,
  getCurrentUserId,
  splitwiseExpenseToRow,
} from "@/lib/splitwise-client";
import { insertRows } from "@/lib/insert";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    db();
    const myId = Number(getSetting("splitwise_user_id") ?? "0") || (await getCurrentUserId());
    setSetting("splitwise_user_id", String(myId));
    const cursor = getSetting("splitwise_last_sync") ?? undefined;
    const expenses = await fetchExpenses({ updated_after: cursor, limit: 500 });
    const rows = expenses
      .map((e) => splitwiseExpenseToRow(e, myId))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const { inserted, skipped } = insertRows(rows, "splitwise-api");
    const nowIso = new Date().toISOString();
    setSetting("splitwise_last_sync", nowIso);
    return NextResponse.json({
      fetched: expenses.length,
      parsed: rows.length,
      inserted,
      skipped,
      last_sync: nowIso,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
