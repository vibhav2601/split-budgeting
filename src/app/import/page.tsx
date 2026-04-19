"use client";

import { useState } from "react";
import {
  CSV_FIELD_DEFS,
  type CSVColumnMapping,
  type CSVImportConfig,
  type CSVPreviewResult,
} from "@/lib/csv-import";
import type { Source } from "@/lib/types";

type Result = { ok: boolean; body: unknown };

const SOURCE_LABELS: Record<Source, string> = {
  credit_card: "Credit card",
  venmo: "Venmo",
  splitwise: "Splitwise",
};

export default function ImportPage() {
  const [csvResult, setCsvResult] = useState<Result | null>(null);
  const [imgResult, setImgResult] = useState<Result | null>(null);
  const [syncResult, setSyncResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CSVPreviewResult | null>(null);
  const [csvSource, setCsvSource] = useState<Source>("credit_card");
  const [csvMapping, setCsvMapping] = useState<CSVColumnMapping>({});
  const [csvMyName, setCsvMyName] = useState("");

  const requiredFields = CSV_FIELD_DEFS[csvSource].filter((field) => field.required);
  const missingRequired = requiredFields.filter((field) => !csvMapping[field.key]);

  async function postFile(endpoint: string, file: File, setter: (r: Result) => void) {
    setBusy(endpoint);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const body = await res.json();
      setter({ ok: res.ok, body });
    } finally {
      setBusy(null);
    }
  }

  async function previewCsv(file: File) {
    setBusy("csv-preview");
    setCsvResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/csv/preview", { method: "POST", body: fd });
      const body = (await res.json()) as CSVPreviewResult & { error?: string };
      if (!res.ok) {
        setCsvPreview(null);
        setCsvFile(null);
        setCsvResult({ ok: false, body });
        return;
      }

      const recommendedSource = body.recommended_source ?? "credit_card";
      setCsvFile(file);
      setCsvPreview(body);
      setCsvSource(recommendedSource);
      setCsvMapping({ ...body.recommended_mappings[recommendedSource] });
      setCsvMyName("");
    } finally {
      setBusy(null);
    }
  }

  async function importCsv() {
    if (!csvFile) return;
    setBusy("csv-import");
    try {
      const fd = new FormData();
      const config: CSVImportConfig = {
        source: csvSource,
        mapping: csvMapping,
        my_name: csvSource === "splitwise" ? csvMyName || null : null,
      };
      fd.append("file", csvFile);
      fd.append("config", JSON.stringify(config));
      const res = await fetch("/api/import/csv", { method: "POST", body: fd });
      const body = await res.json();
      setCsvResult({ ok: res.ok, body });
      setCsvFile(null);
      setCsvPreview(null);
      setCsvMapping({});
      setCsvMyName("");
    } finally {
      setBusy(null);
    }
  }

  function applySource(nextSource: Source) {
    setCsvSource(nextSource);
    if (csvPreview) {
      setCsvMapping({ ...csvPreview.recommended_mappings[nextSource] });
    } else {
      setCsvMapping({});
    }
  }

  function updateMapping(field: keyof CSVColumnMapping, value: string) {
    setCsvMapping((prev) => ({ ...prev, [field]: value || null }));
  }

  async function syncSplitwise() {
    setBusy("splitwise");
    try {
      const res = await fetch("/api/splitwise/sync", { method: "POST" });
      const body = await res.json();
      setSyncResult({ ok: res.ok, body });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Import</h1>
        <p className="text-sm opacity-70 mt-1">
          Review CSV columns before import. The app recommends a source and
          mappings, then you verify them against a live preview.
        </p>
      </header>

      <Section
        title="CSV review"
        hint="Upload a CSV, inspect the preview, confirm the source, then map each field before importing."
      >
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy !== null}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) previewCsv(f);
            e.target.value = "";
          }}
        />

        {csvPreview && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="opacity-60">File:</span>
              <span className="font-medium">{csvFile?.name}</span>
              {csvPreview.recommended_source && (
                <>
                  <span className="opacity-30">|</span>
                  <span className="opacity-60">Recommended source:</span>
                  <span className="font-medium">
                    {SOURCE_LABELS[csvPreview.recommended_source]}
                  </span>
                </>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Source</div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SOURCE_LABELS) as Source[]).map((source) => (
                  <button
                    key={source}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => applySource(source)}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      csvSource === source
                        ? "border-black/50 bg-black text-white dark:border-white/50 dark:bg-white dark:text-black"
                        : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {SOURCE_LABELS[source]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {CSV_FIELD_DEFS[csvSource].map((field) => {
                const missing = field.required && !csvMapping[field.key];
                return (
                  <label
                    key={field.key}
                    className={`rounded border p-3 space-y-2 ${
                      missing
                        ? "border-red-500/40 bg-red-500/5"
                        : "border-black/10 dark:border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{field.label}</span>
                      <span className="text-xs opacity-60">
                        {field.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <select
                      value={csvMapping[field.key] ?? ""}
                      disabled={busy !== null}
                      onChange={(e) => updateMapping(field.key, e.target.value)}
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="">Select a column</option>
                      {csvPreview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>

            {csvSource === "splitwise" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">My Splitwise name</span>
                <input
                  value={csvMyName}
                  disabled={busy !== null}
                  onChange={(e) => setCsvMyName(e.target.value)}
                  placeholder="Optional, used to read the paid by column"
                  className="w-full rounded border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                />
              </label>
            )}

            {csvPreview.warnings.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <div className="font-medium mb-1">Recommendations need review</div>
                <ul className="space-y-1 opacity-80">
                  {csvPreview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium">CSV preview</h3>
                  <p className="text-xs opacity-60">
                    First {csvPreview.sample_rows.length} rows shown exactly as the file was read.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null || missingRequired.length > 0}
                  onClick={importCsv}
                  className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black text-sm disabled:opacity-50"
                >
                  {busy === "csv-import" ? "Importing…" : "Import CSV"}
                </button>
              </div>

              {missingRequired.length > 0 && (
                <p className="text-sm text-red-500">
                  Assign all required fields before importing.
                </p>
              )}

              <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
                <table className="min-w-full text-xs">
                  <thead className="bg-black/[0.03] dark:bg-white/[0.04]">
                    <tr>
                      {csvPreview.headers.map((header) => (
                        <th key={header} className="px-3 py-2 text-left font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.sample_rows.map((row, idx) => (
                      <tr
                        key={idx}
                        className="border-t border-black/5 dark:border-white/5 align-top"
                      >
                        {csvPreview.headers.map((header) => (
                          <td key={header} className="px-3 py-2 whitespace-pre-wrap">
                            {row[header] || <span className="opacity-30">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <Result r={csvResult} />
      </Section>

      <Section
        title="Screenshot"
        hint="Receipt, Venmo screen, or Splitwise screen. Parsed with OpenAI vision."
      >
        <input
          type="file"
          accept="image/*"
          disabled={busy !== null}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) postFile("/api/import/screenshot", f, setImgResult);
            e.target.value = "";
          }}
        />
        <Result r={imgResult} />
      </Section>

      <Section
        title="Splitwise sync"
        hint="Requires SPLITWISE_API_KEY in .env.local. Pulls everything since the last sync."
      >
        <button
          className="px-4 py-2 border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
          disabled={busy !== null}
          onClick={syncSplitwise}
        >
          {busy === "splitwise" ? "Syncing…" : "Sync now"}
        </button>
        <Result r={syncResult} />
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-black/10 dark:border-white/10 rounded p-5 space-y-3">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-sm opacity-60">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Result({ r }: { r: Result | null }) {
  if (!r) return null;
  return (
    <pre
      className={`text-xs p-3 rounded overflow-auto ${
        r.ok ? "bg-green-500/10" : "bg-red-500/10"
      }`}
    >
      {JSON.stringify(r.body, null, 2)}
    </pre>
  );
}
