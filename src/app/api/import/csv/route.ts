import { NextRequest, NextResponse } from "next/server";
import { parseCSV } from "@/lib/parsers";
import type { CSVImportConfig } from "@/lib/csv-import";
import { insertRows } from "@/lib/insert";

export const runtime = "nodejs";

function readConfig(value: FormDataEntryValue | null): CSVImportConfig | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as Partial<CSVImportConfig>;
  if (!parsed || typeof parsed !== "object") return undefined;
  if (
    parsed.source !== "credit_card" &&
    parsed.source !== "venmo" &&
    parsed.source !== "splitwise"
  ) {
    return undefined;
  }
  return {
    source: parsed.source,
    mapping: parsed.mapping ?? {},
    my_name: typeof parsed.my_name === "string" ? parsed.my_name : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }
    const text = await file.text();
    const config = readConfig(form.get("config"));
    const result = parseCSV(text, { filename: file.name, config });
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
