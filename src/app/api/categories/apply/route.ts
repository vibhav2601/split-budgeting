import { NextRequest, NextResponse } from "next/server";
import { applyTransactionCategory } from "@/lib/categorization";
import { isValidCategory } from "@/lib/categories";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      transaction_id?: number;
      category?: string;
      items?: Array<{ transaction_id?: number; category?: string }>;
    };

    const items =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : [{ transaction_id: body.transaction_id, category: body.category }];

    if (items.length === 0) {
      return NextResponse.json({ error: "no items provided" }, { status: 400 });
    }

    for (const item of items) {
      const transactionId = Number(item.transaction_id);
      const category = typeof item.category === "string" ? item.category.trim() : "";
      if (!Number.isInteger(transactionId) || transactionId <= 0) {
        return NextResponse.json({ error: "invalid transaction_id" }, { status: 400 });
      }
      if (!isValidCategory(category)) {
        return NextResponse.json({ error: "invalid category" }, { status: 400 });
      }
    }

    for (const item of items) {
      applyTransactionCategory(Number(item.transaction_id), item.category!.trim());
    }

    return NextResponse.json({ ok: true, applied: items.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
