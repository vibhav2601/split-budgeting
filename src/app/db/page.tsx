import SourceSectionTable from "./source-section-table";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  mine_only: number;
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
       SUM(CASE WHEN reconciled = 0 AND mine_only = 0 THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN mine_only = 1 THEN 1 ELSE 0 END) AS mine_only,
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
  return source
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function DatabasePage() {
  const { sections, imports } = loadData();
  const totalTxns = sections.reduce((sum, section) => sum + (section.summary.total ?? 0), 0);
  const totalPending = sections.reduce(
    (sum, section) => sum + (section.summary.pending ?? 0),
    0,
  );
  const totalMineOnly = sections.reduce(
    (sum, section) => sum + (section.summary.mine_only ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Database</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect the SQLite contents grouped by transaction source.
          Import history is shown separately.
        </p>
      </header>

      <section className="grid grid-cols-4 gap-4">
        <StatCard label="Transactions" value={totalTxns} />
        <StatCard label="Pending review" value={totalPending} />
        <StatCard label="Mine only" value={totalMineOnly} />
        <StatCard label="Import batches" value={imports.length} />
      </section>

      {/* Import History — collapsed by default */}
      <CollapsibleSection
        title="Import history"
        count={imports.length}
        defaultOpen={false}
      >
        {imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2.5 text-left text-xs font-medium text-muted-foreground">When</th>
                  <th className="py-2.5 pl-4 text-left text-xs font-medium text-muted-foreground">Source</th>
                  <th className="py-2.5 pl-4 text-left text-xs font-medium text-muted-foreground">Filename</th>
                  <th className="py-2.5 pl-4 text-right text-xs font-medium text-muted-foreground">Rows</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((batch) => (
                  <tr key={batch.id} className="border-t border-border/60">
                    <td className="py-1.5 font-mono tabular-nums text-muted-foreground">{batch.imported_at}</td>
                    <td className="py-1.5 pl-4">{sourceLabel(batch.source)}</td>
                    <td className="py-1.5 pl-4 text-muted-foreground">{batch.filename?.trim() || "—"}</td>
                    <td className="py-1.5 pl-4 text-right font-mono tabular-nums">{batch.row_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Source sections — collapsed by default */}
      <div className="space-y-4">
        {sections.map((section) => (
          <CollapsibleSection
            key={section.source}
            title={sourceLabel(section.source)}
            count={section.summary.total ?? 0}
            subtitle={
              section.summary.total > 0 && section.summary.start_date
                ? `${section.summary.start_date} to ${section.summary.end_date} · Pending ${section.summary.pending ?? 0} · Mine only ${section.summary.mine_only ?? 0} · Merged ${section.summary.reconciled ?? 0}`
                : undefined
            }
            defaultOpen={false}
          >
            {section.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing imported for this source.</p>
            ) : (
              <SourceSectionTable source={section.source} initialRows={section.rows} />
            )}
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left cursor-pointer">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <CardTitle>{title}</CardTitle>
                <Badge variant="secondary">{count}</Badge>
              </div>
              {subtitle && (
                <p className="text-xs text-muted-foreground font-normal">{subtitle}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-medium ml-4 shrink-0">
              Expand ↕
            </span>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-mono tabular-nums font-semibold tracking-tight mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
