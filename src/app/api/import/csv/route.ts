import { NextRequest, NextResponse } from "next/server";
import { parseCSV } from "@/lib/parsers";
import { insertRows } from "@/lib/insert";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }
    const text = await file.text();
    const result = parseCSV(text, file.name);
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "no rows parsed", warnings: result.warnings },
        { status: 400 },
      );
    }
    const { inserted, skipped } = insertRows(result.rows, file.name);
    return NextResponse.json({
      source: result.source,
      parsed: result.rows.length,
      inserted,
      skipped,
      warnings: result.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
