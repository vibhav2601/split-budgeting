import { NextResponse } from "next/server";
import { clearDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    clearDatabase();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
