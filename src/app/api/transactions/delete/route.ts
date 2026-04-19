import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Transaction } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transaction_id } = body as { transaction_id?: number };
    if (!Number.isInteger(transaction_id)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    const transactionId = transaction_id as number;

    const d = db();
    const txn = d
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(transactionId) as Transaction | undefined;
    if (!txn) {
      return NextResponse.json({ error: "transaction not found" }, { status: 404 });
    }

    d.transaction((id: number) => {
      d.prepare("DELETE FROM transactions WHERE id = ?").run(id);
      d.prepare(
        `DELETE FROM merge_groups
         WHERE id IN (
           SELECT mg.id
           FROM merge_groups mg
           LEFT JOIN merge_links ml ON ml.merge_group_id = mg.id
           GROUP BY mg.id
           HAVING COUNT(ml.transaction_id) = 0
         )`,
      ).run();
    })(transactionId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
