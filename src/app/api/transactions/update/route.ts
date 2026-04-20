import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Transaction } from "@/lib/types";

export const runtime = "nodejs";

function parseAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.round(value * 100) / 100;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transaction_id, amount_total, amount_my_share } = body as {
      transaction_id?: number;
      amount_total?: number;
      amount_my_share?: number;
    };

    if (typeof transaction_id !== "number" || !Number.isInteger(transaction_id) || transaction_id <= 0) {
      return NextResponse.json({ error: "invalid transaction_id" }, { status: 400 });
    }
    const transactionId = transaction_id;

    const nextTotal = parseAmount(amount_total);
    const nextMyShare = parseAmount(amount_my_share);
    if (nextTotal === null || nextMyShare === null) {
      return NextResponse.json({ error: "amounts must be non-negative numbers" }, { status: 400 });
    }
    if (nextMyShare > nextTotal + 0.01) {
      return NextResponse.json(
        { error: "my share cannot exceed total amount" },
        { status: 400 },
      );
    }

    const d = db();
    const txn = d
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(transactionId) as Transaction | undefined;
    if (!txn) {
      return NextResponse.json({ error: "transaction not found" }, { status: 404 });
    }
    if (txn.reconciled) {
      return NextResponse.json(
        { error: "merged rows cannot have raw amounts edited" },
        { status: 400 },
      );
    }

    d.prepare(
      `UPDATE transactions
       SET amount_total = ?, amount_my_share = ?
       WHERE id = ?`,
    ).run(nextTotal, nextMyShare, transactionId);

    const updated = d
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(transactionId) as Transaction;
    return NextResponse.json({ transaction: updated });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
