import { NextRequest, NextResponse } from "next/server";
import { suggestMerges } from "@/lib/matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const rawTxnId = req.nextUrl.searchParams.get("txn_id");
    const txnId = rawTxnId ? Number(rawTxnId) : undefined;
    if (rawTxnId && (!Number.isInteger(txnId) || (txnId ?? 0) <= 0)) {
      return NextResponse.json({ error: "bad txn_id" }, { status: 400 });
    }
    const { suggestions, focus_txn } = await suggestMerges({
      other_txn_id: txnId,
    });
    return NextResponse.json({ suggestions, focus_txn });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
