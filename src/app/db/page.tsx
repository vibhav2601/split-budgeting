import { db } from "@/lib/db";
import type { Source, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

type ImportBatch = {
  id: number;
  source: string;
  filename: string | null;
  imported_at: string;
  row_count: number;
};

type SourceSummary = {
  total: number;
  reconciled: number;
  pending: number;
  start_date: string | null;
  end_date: string | null;
};

type SourceSection = {
  source: Source;
  summary: SourceSummary;
  rows: Transaction[];
};

const SOURCE_ORDER: Source[] = ["credit_card", "venmo", "splitwise"];

function loadData(): { sections: SourceSection[]; imports: ImportBatch[] } {
  const d = db();

  const summaryStmt = d.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN reconciled = 1 THEN 1 ELSE 0 END) AS reconciled,
       SUM(CASE WHEN reconciled = 0 THEN 1 ELSE 0 END) AS pending,
       MIN(date) AS start_date,
       MAX(date) AS end_date
     FROM transactions
     WHERE source = ?`,
  );
  const rowsStmt = d.prepare(
    `SELECT * FROM transactions WHERE source = ? ORDER BY date DESC, id DESC`,
  );

  const sections = SOURCE_ORDER.map((source) => ({
    source,
    summary: summaryStmt.get(source) as SourceSummary,
    rows: rowsStmt.all(source) as Transaction[],
  }));

  const imports = d
    .prepare(
      `SELECT id, source, filename, imported_at, row_count
       FROM import_batches
       ORDER BY imported_at DESC, id DESC`,
    )
    .all() as ImportBatch[];

  return { sections, imports };
}

function sourceLabel(source: string): string {
  return source.replaceAll("_", " ");
}

function renderValue(value: string | null): string {
  return value && value.trim() ? value : "—";
}

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function DatabasePage() {
  const { sections, imports } = loadData();
  const totalTxns = sections.reduce((sum, section) => sum + (section.summary.total ?? 0), 0);
  const totalPending = sections.reduce(
    (sum, section) => sum + (section.summary.pending ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Database</h1>
        <p className="text-sm opacity-70 mt-1">
          Read-only view of the SQLite contents grouped by transaction source.
          Import history is shown separately because current transactions are
          not linked back to individual batch ids.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Transactions" value={totalTxns} />
        <Stat label="Pending review" value={totalPending} />
        <Stat label="Import batches" value={imports.length} />
      </section>

      <section className="border border-black/10 dark:border-white/10 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Import history</h2>
          <span className="text-xs uppercase opacity-60">import_batches</span>
        </div>
        {imports.length === 0 ? (
          <p className="text-sm opacity-60">No imports recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left opacity-60">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="pr-4">Source</th>
                  <th className="pr-4">Filename</th>
                  <th className="text-right">Rows</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="py-1 pr-4 font-mono">{batch.imported_at}</td>
                    <td className="pr-4">{sourceLabel(batch.source)}</td>
                    <td className="pr-4">{renderValue(batch.filename)}</td>
                    <td className="text-right font-mono">{batch.row_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="space-y-6">
        {sections.map((section) => (
          <section
            key={section.source}
            className="border border-black/10 dark:border-white/10 rounded p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium capitalize">
                  {sourceLabel(section.source)}
                </h2>
                <p className="text-sm opacity-60 mt-1">
                  {section.summary.total === 0
                    ? "No rows in this source."
                    : `Date range ${section.summary.start_date} to ${section.summary.end_date}`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <MiniStat label="Rows" value={section.summary.total ?? 0} />
                <MiniStat label="Pending" value={section.summary.pending ?? 0} />
                <MiniStat label="Merged" value={section.summary.reconciled ?? 0} />
              </div>
            </div>

            {section.rows.length === 0 ? (
              <p className="text-sm opacity-60">Nothing imported for this source.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm align-top">
                  <thead className="text-left opacity-60">
                    <tr>
                      <th className="py-2 pr-4">Date</th>
                      <th className="pr-4">Merchant</th>
                      <th className="pr-4">Description</th>
                      <th className="pr-4">Category</th>
                      <th className="pr-4">Payer</th>
                      <th className="pr-4">Status</th>
                      <th className="pr-4">Currency</th>
                      <th className="pr-4 text-right">Total</th>
                      <th className="pr-4 text-right">My share</th>
                      <th className="pr-4">External id</th>
                      <th>Raw JSON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-black/5 dark:border-white/5"
                      >
                        <td className="py-2 pr-4 font-mono whitespace-nowrap">{row.date}</td>
                        <td className="pr-4 min-w-40">{row.merchant_raw}</td>
                        <td className="pr-4 min-w-48">{renderValue(row.description)}</td>
                        <td className="pr-4 whitespace-nowrap">{renderValue(row.category)}</td>
                        <td className="pr-4 whitespace-nowrap">{row.payer}</td>
                        <td className="pr-4 whitespace-nowrap">
                          {row.reconciled ? "merged" : "pending"}
                        </td>
                        <td className="pr-4 whitespace-nowrap">{row.currency}</td>
                        <td className="pr-4 text-right font-mono whitespace-nowrap">
                          ${row.amount_total.toFixed(2)}
                        </td>
                        <td className="pr-4 text-right font-mono whitespace-nowrap">
                          ${row.amount_my_share.toFixed(2)}
                        </td>
                        <td className="pr-4 font-mono text-xs min-w-36">
                          {renderValue(row.external_id)}
                        </td>
                        <td className="min-w-56">
                          {row.raw_json ? (
                            <details>
                              <summary className="cursor-pointer text-xs underline underline-offset-2">
                                View raw JSON
                              </summary>
                              <pre className="mt-2 text-xs p-3 rounded bg-black/5 dark:bg-white/5 overflow-x-auto">
                                {prettyJson(row.raw_json)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-xs opacity-50">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-black/10 dark:border-white/10 rounded p-4">
      <div className="text-xs uppercase tracking-wide opacity-60">{label}</div>
      <div className="text-2xl font-mono mt-1">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-black/10 dark:border-white/10 rounded px-3 py-2 text-right">
      <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
