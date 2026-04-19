import { NextRequest, NextResponse } from "next/server";
import { confirmMerge } from "@/lib/matcher";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { splitwise_txn_id, other_txn_ids, notes } = body as {
      splitwise_txn_id: number;
      other_txn_ids: number[];
      notes?: string;
    };
    if (!splitwise_txn_id || !Array.isArray(other_txn_ids)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const groupId = confirmMerge({ splitwise_txn_id, other_txn_ids, notes });
    return NextResponse.json({ group_id: groupId });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
