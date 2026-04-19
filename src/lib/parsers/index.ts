import Papa from "papaparse";
import type { Source } from "../types";
import { normalizeMerchant } from "../merchant-normalize";

export interface ParsedRow {
  source: Source;
  external_id: string | null;
  date: string;
  amount_total: number;
  amount_my_share: number;
  payer: "me" | "other" | "shared";
  merchant_raw: string;
  merchant_normalized: string;
  description: string | null;
  category: string | null;
  currency: string;
  raw_json: string;
}

export type ParserResult = {
  source: Source;
  rows: ParsedRow[];
  warnings: string[];
};

export function parseCSV(csvText: string, filename?: string): ParserResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = (parsed.meta.fields ?? []).map((h) => h.toLowerCase().trim());
  const source = detectSource(headers, filename);
  if (!source) {
    return {
      source: "credit_card",
      rows: [],
      warnings: [`Could not auto-detect source. Headers: ${headers.join(", ")}`],
    };
  }
  const rows = parsed.data
    .map((r) => normalizeKeys(r))
    .map((r) => {
      if (source === "credit_card") return parseCreditCardRow(r);
      if (source === "venmo") return parseVenmoRow(r);
      return parseSplitwiseRow(r);
    })
    .filter((x): x is ParsedRow => x !== null);
  return { source, rows, warnings: [] };
}

function normalizeKeys(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = (v ?? "").toString().trim();
  }
  return out;
}

function detectSource(headers: string[], filename?: string): Source | null {
  const has = (h: string) => headers.includes(h);
  const fn = (filename ?? "").toLowerCase();
  if (fn.includes("splitwise") || (has("cost") && has("category") && has("currency"))) {
    return "splitwise";
  }
  if (fn.includes("venmo") || (has("datetime") && has("amount (total)")) || has("from")) {
    return "venmo";
  }
  if (has("transaction date") || has("post date") || has("amount")) {
    return "credit_card";
  }
  return null;
}

function parseCreditCardRow(r: Record<string, string>): ParsedRow | null {
  const date = r["transaction date"] || r["date"] || r["post date"] || "";
  const amtStr = r["amount"] || r["debit"] || r["charge"] || "";
  const merchant = r["description"] || r["merchant"] || r["name"] || "";
  if (!date || !amtStr || !merchant) return null;
  const amt = Math.abs(parseFloat(amtStr.replace(/[$,]/g, "")));
  if (!Number.isFinite(amt) || amt === 0) return null;
  const iso = toISODate(date);
  if (!iso) return null;
  return {
    source: "credit_card",
    external_id: `cc:${iso}:${amt}:${merchant}`.slice(0, 200),
    date: iso,
    amount_total: amt,
    amount_my_share: amt,
    payer: "me",
    merchant_raw: merchant,
    merchant_normalized: normalizeMerchant(merchant),
    description: r["category"] || null,
    category: r["category"] || null,
    currency: "USD",
    raw_json: JSON.stringify(r),
  };
}

function parseVenmoRow(r: Record<string, string>): ParsedRow | null {
  const date = r["datetime"] || r["date"] || "";
  const amtStr = r["amount (total)"] || r["amount"] || "";
  const note = r["note"] || r["description"] || "";
  const from = r["from"] || "";
  const to = r["to"] || "";
  const type = (r["type"] || "").toLowerCase();
  if (!date || !amtStr) return null;
  const raw = parseFloat(amtStr.replace(/[$,+]/g, ""));
  if (!Number.isFinite(raw) || raw === 0) return null;
  const amt = Math.abs(raw);
  const paidByMe = raw < 0;
  const iso = toISODate(date);
  if (!iso) return null;
  const counterparty = paidByMe ? to : from;
  const merchant = note || counterparty || "Venmo";
  return {
    source: "venmo",
    external_id: `venmo:${iso}:${amt}:${counterparty}:${note}`.slice(0, 200),
    date: iso,
    amount_total: amt,
    amount_my_share: amt,
    payer: paidByMe ? "me" : "other",
    merchant_raw: merchant,
    merchant_normalized: normalizeMerchant(merchant),
    description: `${type} ${paidByMe ? "to" : "from"} ${counterparty}`.trim(),
    category: null,
    currency: (r["funding source"] || "USD").toUpperCase().includes("USD") ? "USD" : "USD",
    raw_json: JSON.stringify(r),
  };
}

function parseSplitwiseRow(r: Record<string, string>): ParsedRow | null {
  const date = r["date"] || "";
  const desc = r["description"] || "";
  const cost = r["cost"] || "";
  const currency = r["currency"] || "USD";
  const category = r["category"] || null;
  if (!date || !desc || !cost) return null;
  const total = parseFloat(cost.replace(/[$,]/g, ""));
  if (!Number.isFinite(total)) return null;
  const myShare = inferMySplitwiseShare(r, total);
  const iPaid = myShare.iPaid;
  const iso = toISODate(date);
  if (!iso) return null;
  return {
    source: "splitwise",
    external_id: `sw:${iso}:${total}:${desc}`.slice(0, 200),
    date: iso,
    amount_total: Math.abs(total),
    amount_my_share: Math.abs(myShare.share),
    payer: iPaid ? "me" : "other",
    merchant_raw: desc,
    merchant_normalized: normalizeMerchant(desc),
    description: desc,
    category,
    currency,
    raw_json: JSON.stringify(r),
  };
}

// Splitwise CSV export uses per-user columns. The current user's column can be
// detected by looking for the column with values summing to a share of the total.
function inferMySplitwiseShare(
  r: Record<string, string>,
  total: number,
): { share: number; iPaid: boolean } {
  const known = new Set([
    "date",
    "description",
    "category",
    "cost",
    "currency",
    "paid by",
    "notes",
  ]);
  const userCols = Object.keys(r).filter((k) => !known.has(k));
  const meName = (process.env.SPLITWISE_MY_NAME ?? "").toLowerCase().trim();
  let myCol = userCols.find((c) => meName && c.toLowerCase() === meName);
  if (!myCol && userCols.length > 0) myCol = userCols[0];
  const myVal = myCol ? parseFloat((r[myCol] || "0").replace(/[$,]/g, "")) : 0;
  const paidBy = (r["paid by"] || "").toLowerCase();
  const iPaid = meName ? paidBy.includes(meName) : myVal > 0 && Math.abs(myVal) > Math.abs(total) / 2;
  const share = Math.abs(myVal) > 0 ? Math.abs(myVal) : total / Math.max(userCols.length, 1);
  return { share, iPaid };
}

function toISODate(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let [, mo, da, yr] = m;
    if (yr.length === 2) yr = "20" + yr;
    const dt = new Date(Number(yr), Number(mo) - 1, Number(da));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  return null;
}
