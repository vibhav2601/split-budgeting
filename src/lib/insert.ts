import { db } from "./db";
import type { ParsedRow } from "./parsers";

export function insertRows(rows: ParsedRow[], filename: string | null): {
  inserted: number;
  skipped: number;
} {
  const d = db();
  const stmt = d.prepare(`
    INSERT INTO transactions
      (source, external_id, date, amount_total, amount_my_share, payer,
       merchant_raw, merchant_normalized, description, category, currency, raw_json)
    VALUES (@source, @external_id, @date, @amount_total, @amount_my_share, @payer,
            @merchant_raw, @merchant_normalized, @description, @category, @currency, @raw_json)
    ON CONFLICT(source, external_id) DO NOTHING
  `);
  let inserted = 0;
  let skipped = 0;
  const tx = d.transaction((rs: ParsedRow[]) => {
    for (const r of rs) {
      const info = stmt.run(r);
      if (info.changes > 0) inserted++;
      else skipped++;
    }
  });
  tx(rows);
  if (rows.length > 0) {
    d.prepare(
      `INSERT INTO import_batches(source, filename, row_count) VALUES(?, ?, ?)`,
    ).run(rows[0].source, filename, inserted);
  }
  return { inserted, skipped };
}
