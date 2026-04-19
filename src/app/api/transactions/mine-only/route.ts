import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Transaction } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transaction_id, mine_only } = body as {
      transaction_id?: number;
      mine_only?: boolean;
    };
    if (!Number.isInteger(transaction_id) || typeof mine_only !== "boolean") {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const d = db();
    const txn = d
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(transaction_id) as Transaction | undefined;
    if (!txn) {
      return NextResponse.json({ error: "transaction not found" }, { status: 404 });
    }
    if (txn.source === "splitwise") {
      return NextResponse.json(
        { error: "splitwise rows cannot be marked mine only" },
        { status: 400 },
      );
    }
    if (txn.reconciled) {
      return NextResponse.json(
        { error: "merged rows cannot be changed to mine only" },
        { status: 400 },
      );
    }

    d.prepare("UPDATE transactions SET mine_only = ? WHERE id = ?").run(
      mine_only ? 1 : 0,
      transaction_id,
    );

    const updated = d
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(transaction_id) as Transaction;
    return NextResponse.json({ transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
