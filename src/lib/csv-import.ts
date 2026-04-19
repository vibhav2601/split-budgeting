import type { Source } from "./types";

export type CSVImportField =
  | "date"
  | "amount"
  | "merchant"
  | "description"
  | "category"
  | "currency"
  | "from"
  | "to"
  | "type"
  | "paidBy"
  | "myShare";

export type CSVColumnMapping = Partial<Record<CSVImportField, string | null>>;

export interface CSVImportConfig {
  source: Source;
  mapping: CSVColumnMapping;
  my_name?: string | null;
}

export interface CSVFieldDef {
  key: CSVImportField;
  label: string;
  required: boolean;
  help?: string;
}

export interface CSVPreviewResult {
  headers: string[];
  sample_rows: Record<string, string>[];
  recommended_source: Source | null;
  recommended_mappings: Record<Source, CSVColumnMapping>;
  warnings: string[];
}

export const CSV_FIELD_DEFS: Record<Source, CSVFieldDef[]> = {
  credit_card: [
    { key: "date", label: "Transaction date", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "merchant", label: "Merchant", required: true },
    { key: "description", label: "Description", required: false },
    { key: "category", label: "Category", required: false },
  ],
  venmo: [
    { key: "date", label: "Date/time", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "merchant", label: "Note / label", required: false },
    { key: "from", label: "From", required: false },
    { key: "to", label: "To", required: false },
    { key: "type", label: "Type", required: false },
  ],
  splitwise: [
    { key: "date", label: "Date", required: true },
    { key: "merchant", label: "Description", required: true },
    { key: "amount", label: "Total cost", required: true },
    { key: "myShare", label: "My share column", required: false },
    { key: "paidBy", label: "Paid by", required: false },
    { key: "category", label: "Category", required: false },
    { key: "currency", label: "Currency", required: false },
  ],
};
