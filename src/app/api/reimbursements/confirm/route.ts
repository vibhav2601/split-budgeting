import { NextRequest, NextResponse } from "next/server";
import { confirmVenmoReimbursementMerge } from "@/lib/matcher";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { credit_card_txn_id, venmo_txn_ids, true_my_share, notes } = body as {
      credit_card_txn_id: number;
      venmo_txn_ids: number[];
      true_my_share: number;
      notes?: string;
    };
    if (
      !Number.isInteger(credit_card_txn_id) ||
      !Array.isArray(venmo_txn_ids) ||
      !Number.isFinite(true_my_share)
    ) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const groupId = confirmVenmoReimbursementMerge({
      credit_card_txn_id,
      venmo_txn_ids,
      true_my_share,
      notes,
    });
    return NextResponse.json({ group_id: groupId });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
