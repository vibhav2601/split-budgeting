import { NextResponse } from "next/server";
import { suggestMerges } from "@/lib/matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const suggestions = await suggestMerges();
    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
