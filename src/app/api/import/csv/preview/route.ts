import { NextRequest, NextResponse } from "next/server";
import { previewCSV } from "@/lib/parsers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }

    const text = await file.text();
    const preview = previewCSV(text, file.name);
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
