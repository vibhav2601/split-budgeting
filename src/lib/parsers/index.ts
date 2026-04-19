import Papa from "papaparse";
import {
  CSV_FIELD_DEFS,
  type CSVColumnMapping,
  type CSVImportConfig,
  type CSVImportField,
  type CSVPreviewResult,
} from "../csv-import";
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

type ParseOptions = {
  filename?: string;
  config?: CSVImportConfig;
};

const FIELD_ALIASES: Record<CSVImportField, string[]> = {
  date: [
    "transaction date",
    "date",
    "post date",
    "posted date",
    "clearing date",
    "datetime",
  ],
  amount: [
    "amount",
    "amount total",
    "amount usd",
    "amount in usd",
    "amount (total)",
    "amount (usd)",
    "debit",
    "charge",
    "cost",
    "total",
    "total cost",
  ],
  merchant: [
    "merchant",
    "description",
    "name",
    "payee",
    "note",
    "details",
    "expense",
  ],
  description: ["description", "details", "memo", "note"],
  category: ["category"],
  currency: ["currency", "currency code", "currency_code"],
  from: ["from", "sender"],
  to: ["to", "recipient"],
  type: ["type"],
  paidBy: ["paid by", "paid_by", "payer"],
  myShare: ["my share", "your share", "you", "owed share"],
};

const SOURCE_FIELD_ORDER: Record<Source, CSVImportField[]> = {
  credit_card: ["date", "amount", "merchant", "description", "category"],
  venmo: ["date", "amount", "merchant", "from", "to", "type"],
  splitwise: ["date", "merchant", "amount", "myShare", "paidBy", "category", "currency"],
};

export function parseCSV(csvText: string, options: ParseOptions = {}): ParserResult {
  const parsed = parseRawCSV(csvText);
  const detected =
    options.config?.source ?? detectSource(normalizeHeaders(parsed.headers), options.filename);
  if (!detected) {
    return {
      source: "credit_card",
      rows: [],
      warnings: [
        `Could not auto-detect source. Headers: ${parsed.headers.join(", ")}`,
      ],
    };
  }

  const warnings = options.config ? validateRequiredFields(detected, options.config.mapping) : [];
  const recommended = recommendMappings(parsed.headers)[detected];
  const mapping = options.config?.mapping ?? recommended;
  const rows = parsed.rows
    .map((r) => normalizeKeys(r))
    .map((r) => {
      if (detected === "credit_card") return parseCreditCardRow(r, mapping);
      if (detected === "venmo") return parseVenmoRow(r, mapping);
      return parseSplitwiseRow(r, mapping, options.config);
    })
    .filter((x): x is ParsedRow => x !== null);

  return { source: detected, rows, warnings };
}

export function previewCSV(csvText: string, filename?: string): CSVPreviewResult {
  const parsed = parseRawCSV(csvText);
  const recommendedSource = detectSource(normalizeHeaders(parsed.headers), filename);
  const recommendedMappings = recommendMappings(parsed.headers);
  const warnings = recommendedSource
    ? validateRequiredFields(recommendedSource, recommendedMappings[recommendedSource])
    : [`Could not auto-detect source. Headers: ${parsed.headers.join(", ")}`];

  return {
    headers: parsed.headers,
    sample_rows: parsed.rows.slice(0, 6),
    recommended_source: recommendedSource,
    recommended_mappings: recommendedMappings,
    warnings,
  };
}

function parseRawCSV(csvText: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.map((row) => sanitizeRawRow(headers, row));
  return { headers, rows };
}

function sanitizeRawRow(
  headers: string[],
  row: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    out[header] = (row[header] ?? "").toString().trim();
  }
  return out;
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => normalizeHeaderName(h));
}

function normalizeKeys(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeHeaderName(k)] = (v ?? "").toString().trim();
  }
  return out;
}

function normalizeHeaderName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSource(headers: string[], filename?: string): Source | null {
  const has = (...aliases: string[]) =>
    aliases.some((alias) => headers.includes(normalizeHeaderName(alias)));
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

function recommendMappings(headers: string[]): Record<Source, CSVColumnMapping> {
  return {
    credit_card: recommendMappingForSource(headers, "credit_card"),
    venmo: recommendMappingForSource(headers, "venmo"),
    splitwise: recommendMappingForSource(headers, "splitwise"),
  };
}

function recommendMappingForSource(headers: string[], source: Source): CSVColumnMapping {
  const used = new Set<string>();
  const mapping: CSVColumnMapping = {};

  for (const field of SOURCE_FIELD_ORDER[source]) {
    const preferred = findHeader(headers, FIELD_ALIASES[field], used);
    if (preferred) {
      mapping[field] = preferred;
      used.add(preferred);
    }
  }

  return mapping;
}

function findHeader(
  headers: string[],
  aliases: string[],
  used: Set<string>,
): string | null {
  const exact = headers.find((header) => {
    if (used.has(header)) return false;
    const normalized = normalizeHeaderName(header);
    return aliases.some((alias) => normalized === normalizeHeaderName(alias));
  });
  if (exact) return exact;

  const partial = headers.find((header) => {
    if (used.has(header)) return false;
    const normalized = normalizeHeaderName(header);
    return aliases.some((alias) => {
      const target = normalizeHeaderName(alias);
      return normalized.includes(target) || target.includes(normalized);
    });
  });
  return partial ?? null;
}

function validateRequiredFields(source: Source, mapping: CSVColumnMapping): string[] {
  const warnings: string[] = [];
  for (const field of CSV_FIELD_DEFS[source]) {
    if (field.required && !mapping[field.key]) {
      warnings.push(`Missing recommended column for "${field.label}".`);
    }
  }
  return warnings;
}

function getFieldValue(
  row: Record<string, string>,
  mapping: CSVColumnMapping | undefined,
  field: CSVImportField,
): string {
  const mappedHeader = mapping?.[field];
  if (mappedHeader) {
    const mapped = row[normalizeHeaderName(mappedHeader)];
    if (mapped) return mapped;
  }
  for (const alias of FIELD_ALIASES[field]) {
    const fallback = row[normalizeHeaderName(alias)];
    if (fallback) return fallback;
  }
  return "";
}

function parseAmountValue(input: string): number {
  const trimmed = input.trim();
  const negative = trimmed.includes("(") && trimmed.includes(")");
  const cleaned = trimmed.replace(/[$,\s]/g, "").replace(/[()]/g, "");
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseCreditCardRow(
  row: Record<string, string>,
  mapping: CSVColumnMapping,
): ParsedRow | null {
  const date = getFieldValue(row, mapping, "date");
  const amtStr = getFieldValue(row, mapping, "amount");
  const merchant = getFieldValue(row, mapping, "merchant");
  const description = getFieldValue(row, mapping, "description");
  const category = getFieldValue(row, mapping, "category");
  if (!date || !amtStr || !merchant) return null;

  const amount = Math.abs(parseAmountValue(amtStr));
  if (!Number.isFinite(amount) || amount === 0) return null;
  const iso = toISODate(date);
  if (!iso) return null;

  return {
    source: "credit_card",
    external_id: `cc:${iso}:${amount}:${merchant}`.slice(0, 200),
    date: iso,
    amount_total: amount,
    amount_my_share: amount,
    payer: "me",
    merchant_raw: merchant,
    merchant_normalized: normalizeMerchant(merchant),
    description: description || category || null,
    category: category || null,
    currency: "USD",
    raw_json: JSON.stringify(row),
  };
}

function parseVenmoRow(
  row: Record<string, string>,
  mapping: CSVColumnMapping,
): ParsedRow | null {
  const date = getFieldValue(row, mapping, "date");
  const amtStr = getFieldValue(row, mapping, "amount");
  const merchantHint = getFieldValue(row, mapping, "merchant");
  const from = getFieldValue(row, mapping, "from");
  const to = getFieldValue(row, mapping, "to");
  const type = getFieldValue(row, mapping, "type").toLowerCase();
  if (!date || !amtStr) return null;

  const raw = parseAmountValue(amtStr);
  if (!Number.isFinite(raw) || raw === 0) return null;
  const amount = Math.abs(raw);
  const paidByMe = raw < 0;
  const iso = toISODate(date);
  if (!iso) return null;

  const counterparty = paidByMe ? to : from;
  const merchant = merchantHint || counterparty || "Venmo";
  return {
    source: "venmo",
    external_id: `venmo:${iso}:${amount}:${counterparty}:${merchant}`.slice(0, 200),
    date: iso,
    amount_total: amount,
    amount_my_share: amount,
    payer: paidByMe ? "me" : "other",
    merchant_raw: merchant,
    merchant_normalized: normalizeMerchant(merchant),
    description: `${type} ${paidByMe ? "to" : "from"} ${counterparty}`.trim(),
    category: null,
    currency: "USD",
    raw_json: JSON.stringify(row),
  };
}

function parseSplitwiseRow(
  row: Record<string, string>,
  mapping: CSVColumnMapping,
  config?: CSVImportConfig,
): ParsedRow | null {
  const date = getFieldValue(row, mapping, "date");
  const description = getFieldValue(row, mapping, "merchant");
  const cost = getFieldValue(row, mapping, "amount");
  const currency = getFieldValue(row, mapping, "currency") || "USD";
  const category = getFieldValue(row, mapping, "category") || null;
  if (!date || !description || !cost) return null;

  const total = parseAmountValue(cost);
  if (!Number.isFinite(total)) return null;
  const myShare = inferMySplitwiseShare(row, total, mapping, config?.my_name ?? null);
  const iso = toISODate(date);
  if (!iso) return null;

  return {
    source: "splitwise",
    external_id: `sw:${iso}:${total}:${description}`.slice(0, 200),
    date: iso,
    amount_total: Math.abs(total),
    amount_my_share: Math.abs(myShare.share),
    payer: myShare.iPaid ? "me" : "other",
    merchant_raw: description,
    merchant_normalized: normalizeMerchant(description),
    description,
    category,
    currency,
    raw_json: JSON.stringify(row),
  };
}

function inferMySplitwiseShare(
  row: Record<string, string>,
  total: number,
  mapping: CSVColumnMapping,
  myNameOverride: string | null,
): { share: number; iPaid: boolean } {
  const explicitShare = parseAmountValue(getFieldValue(row, mapping, "myShare"));
  const paidBy = getFieldValue(row, mapping, "paidBy").toLowerCase();
  const myName = (myNameOverride ?? process.env.SPLITWISE_MY_NAME ?? "")
    .toLowerCase()
    .trim();

  const known = new Set(
    ["date", "description", "category", "cost", "currency", "paid by", "notes"].map(
      normalizeHeaderName,
    ),
  );
  for (const header of Object.values(mapping)) {
    if (header) known.add(normalizeHeaderName(header));
  }
  const userCols = Object.keys(row).filter((key) => !known.has(key));

  let myCol = mapping.myShare ? normalizeHeaderName(mapping.myShare) : "";
  if (!myCol && myName) {
    myCol =
      userCols.find((key) => key === normalizeHeaderName(myName)) ??
      userCols.find((key) => key.includes(myName) || myName.includes(key)) ??
      "";
  }
  if (!myCol && userCols.length > 0) myCol = userCols[0];

  const inferredShare = myCol ? parseAmountValue(row[myCol] || "0") : Number.NaN;
  const share = Number.isFinite(explicitShare) && explicitShare !== 0
    ? Math.abs(explicitShare)
    : Number.isFinite(inferredShare) && inferredShare !== 0
      ? Math.abs(inferredShare)
      : Math.abs(total) / Math.max(userCols.length, 1);

  const iPaid = myName
    ? paidBy.includes(myName)
    : Number.isFinite(inferredShare) && Math.abs(inferredShare) > Math.abs(total) / 2;

  return { share, iPaid };
}

function toISODate(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let [, mo, da, yr] = m;
    if (yr.length === 2) yr = `20${yr}`;
    const dt = new Date(Number(yr), Number(mo) - 1, Number(da));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  return null;
}
