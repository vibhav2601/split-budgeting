import { NextRequest, NextResponse } from "next/server";
import { extractReceiptFromImage } from "@/lib/vision";
import { insertRows } from "@/lib/insert";
import { normalizeMerchant } from "@/lib/merchant-normalize";
import type { ParsedRow } from "@/lib/parsers";
import type { Source } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Media = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function mediaType(name: string, fallback: string): Media {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (fallback === "image/png") return "image/png";
  if (fallback === "image/webp") return "image/webp";
  if (fallback === "image/gif") return "image/gif";
  return "image/jpeg";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const explicitSource = (form.get("source") as Source | null) ?? null;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = buf.toString("base64");
    const media = mediaType(file.name, file.type);
    const extracted = await extractReceiptFromImage(b64, media);
    const source: Source =
      explicitSource ?? (extracted.source_hint === "receipt" ? "credit_card" : (extracted.source_hint ?? "credit_card"));
    const row: ParsedRow = {
      source,
      external_id: `${source}:img:${extracted.date}:${extracted.total}:${extracted.merchant}`.slice(0, 200),
      date: extracted.date,
      amount_total: Math.abs(extracted.total),
      amount_my_share: Math.abs(extracted.total),
      payer: source === "splitwise" ? "shared" : "me",
      merchant_raw: extracted.merchant,
      merchant_normalized: normalizeMerchant(extracted.merchant),
      description: extracted.line_items?.map((l) => l.name).join(", ") ?? null,
      category: null,
      currency: extracted.currency || "USD",
      raw_json: JSON.stringify(extracted),
    };
    const { inserted, skipped } = insertRows([row], file.name);
    return NextResponse.json({ extracted, inserted, skipped, row });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
