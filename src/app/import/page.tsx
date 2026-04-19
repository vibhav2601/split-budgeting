"use client";

import { useState } from "react";

type Result = { ok: boolean; body: unknown };

export default function ImportPage() {
  const [csvResult, setCsvResult] = useState<Result | null>(null);
  const [imgResult, setImgResult] = useState<Result | null>(null);
  const [syncResult, setSyncResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
          Pull your credit card, Venmo, and Splitwise activity. Source is
          auto-detected for CSVs.
        </p>
      </header>

      <Section title="CSV upload" hint="Credit card, Venmo, or Splitwise export.">
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy !== null}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) postFile("/api/import/csv", f, setCsvResult);
            e.target.value = "";
          }}
        />
        <Result r={csvResult} />
      </Section>

      <Section
        title="Screenshot"
        hint="Receipt, Venmo screen, or Splitwise screen. Parsed with Claude vision."
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
