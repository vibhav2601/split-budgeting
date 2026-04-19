import { CATEGORY_OPTIONS, isValidCategory } from "./categories";
import { db } from "./db";
import type {
  CategorySuggestion,
  Transaction,
  UncategorizedTransactionRow,
} from "./types";

type UncategorizedSuggestionRow = Transaction & {
  suggested_category: string | null;
  suggestion_reason: string | null;
  suggestion_confidence: number | null;
  suggestion_model: string | null;
  suggestion_created_at: string | null;
  suggestion_updated_at: string | null;
};

export type CategorizationCandidate = Pick<
  Transaction,
  | "id"
  | "source"
  | "date"
  | "merchant_raw"
  | "description"
  | "amount_total"
  | "amount_my_share"
  | "currency"
>;

export const UNCATEGORIZED_SQL = "(category IS NULL OR trim(category) = '')";

function mapSuggestion(row: UncategorizedSuggestionRow): CategorySuggestion | null {
  if (
    !row.suggested_category ||
    !isValidCategory(row.suggested_category) ||
    row.suggestion_confidence === null ||
    !row.suggestion_model
  ) {
    return null;
  }
  return {
    transaction_id: row.id,
    suggested_category: row.suggested_category,
    reason: row.suggestion_reason,
    confidence: row.suggestion_confidence,
    model: row.suggestion_model,
    created_at: row.suggestion_created_at ?? "",
    updated_at: row.suggestion_updated_at ?? "",
  };
}

export function listUncategorizedTransactions(): UncategorizedTransactionRow[] {
  const rows = db()
    .prepare(
      `SELECT
         t.*,
         s.suggested_category,
         s.reason AS suggestion_reason,
         s.confidence AS suggestion_confidence,
         s.model AS suggestion_model,
         s.created_at AS suggestion_created_at,
         s.updated_at AS suggestion_updated_at
       FROM transactions t
       LEFT JOIN category_suggestions s ON s.transaction_id = t.id
       WHERE ${UNCATEGORIZED_SQL}
       ORDER BY t.date DESC, t.id DESC`,
    )
    .all() as UncategorizedSuggestionRow[];

  return rows.map((row) => ({
    transaction: {
      id: row.id,
      source: row.source,
      external_id: row.external_id,
      date: row.date,
      amount_total: row.amount_total,
      amount_my_share: row.amount_my_share,
      payer: row.payer,
      merchant_raw: row.merchant_raw,
      merchant_normalized: row.merchant_normalized,
      description: row.description,
      category: row.category,
      currency: row.currency,
      reconciled: row.reconciled,
      mine_only: row.mine_only,
      raw_json: row.raw_json,
    },
    suggestion: mapSuggestion(row),
  }));
}

export function listTransactionsMissingCategorySuggestions(): CategorizationCandidate[] {
  const rows = db()
    .prepare(
      `SELECT
         t.id,
         t.source,
         t.date,
         t.merchant_raw,
         t.description,
         t.amount_total,
         t.amount_my_share,
         t.currency,
         s.suggested_category
       FROM transactions t
       LEFT JOIN category_suggestions s ON s.transaction_id = t.id
       WHERE ${UNCATEGORIZED_SQL}
       ORDER BY t.date DESC, t.id DESC`,
    )
    .all() as Array<CategorizationCandidate & { suggested_category: string | null }>;

  return rows
    .filter((row) => !row.suggested_category || !isValidCategory(row.suggested_category))
    .map(({ suggested_category: _ignored, ...row }) => row);
}

export function upsertCategorySuggestions(
  suggestions: Array<{
    transaction_id: number;
    suggested_category: string;
    reason: string | null;
    confidence: number;
    model: string;
  }>,
) {
  if (suggestions.length === 0) return;
  const stmt = db().prepare(
    `INSERT INTO category_suggestions
       (transaction_id, suggested_category, reason, confidence, model)
     VALUES (@transaction_id, @suggested_category, @reason, @confidence, @model)
     ON CONFLICT(transaction_id) DO UPDATE SET
       suggested_category = excluded.suggested_category,
       reason = excluded.reason,
       confidence = excluded.confidence,
       model = excluded.model,
       updated_at = datetime('now')`,
  );
  const tx = db().transaction(
    (
      rows: Array<{
        transaction_id: number;
        suggested_category: string;
        reason: string | null;
        confidence: number;
        model: string;
      }>,
    ) => {
      for (const row of rows) {
        stmt.run(row);
      }
    },
  );
  tx(suggestions);
}

export function applyTransactionCategory(transactionId: number, category: string) {
  if (!isValidCategory(category)) {
    throw new Error(`invalid category: ${category}`);
  }
  const info = db()
    .prepare("UPDATE transactions SET category = ? WHERE id = ?")
    .run(category, transactionId);
  if (info.changes === 0) {
    throw new Error(`transaction ${transactionId} not found`);
  }
}

export function categoryOptions(): readonly string[] {
  return CATEGORY_OPTIONS;
}
