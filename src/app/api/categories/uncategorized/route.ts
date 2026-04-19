import { NextResponse } from "next/server";
import { listUncategorizedTransactions } from "@/lib/categorization";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = listUncategorizedTransactions();
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
