import { NextResponse } from "next/server";
import {
  listTransactionsMissingCategorySuggestions,
  upsertCategorySuggestions,
} from "@/lib/categorization";
import { OPENAI_MODEL, suggestTransactionCategories } from "@/lib/vision";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function POST() {
  try {
    const missing = listTransactionsMissingCategorySuggestions();
    if (missing.length === 0) {
      return NextResponse.json({
        processed: 0,
        suggested: 0,
        failed_batches: 0,
      });
    }

    let suggested = 0;
    let failedBatches = 0;
    const errors: string[] = [];

    for (const batch of chunk(missing, BATCH_SIZE)) {
      try {
        const suggestions = await suggestTransactionCategories(batch);
        upsertCategorySuggestions(
          suggestions.map((row) => ({
            transaction_id: row.transaction_id,
            suggested_category: row.category,
            reason: row.reason,
            confidence: row.confidence,
            model: OPENAI_MODEL,
          })),
        );
        suggested += suggestions.length;
      } catch (e) {
        failedBatches += 1;
        errors.push((e as Error).message);
      }
    }

    return NextResponse.json({
      processed: missing.length,
      suggested,
      failed_batches: failedBatches,
      errors,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
