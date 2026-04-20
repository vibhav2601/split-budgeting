export const MONTHLY_EXPORT_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "category", label: "Category" },
  { id: "merchant", label: "Merchant" },
  { id: "description", label: "Description" },
  { id: "source", label: "Source" },
  { id: "final_amount", label: "Final Amount" },
  { id: "original_amount", label: "Original Amount" },
  { id: "my_share", label: "My Share" },
  { id: "payer", label: "Payer" },
  { id: "status", label: "Status" },
  { id: "transaction_ids", label: "Transaction IDs" },
  { id: "merge_group_id", label: "Merge Group ID" },
] as const;

export type MonthlyExportColumnId = (typeof MONTHLY_EXPORT_COLUMNS)[number]["id"];

export const DEFAULT_MONTHLY_EXPORT_COLUMN_IDS: MonthlyExportColumnId[] = [
  "date",
  "category",
  "merchant",
  "description",
  "source",
  "final_amount",
];

const MONTHLY_EXPORT_COLUMN_ID_SET = new Set<MonthlyExportColumnId>(
  MONTHLY_EXPORT_COLUMNS.map((column) => column.id),
);

export function isMonthlyExportColumnId(value: string): value is MonthlyExportColumnId {
  return MONTHLY_EXPORT_COLUMN_ID_SET.has(value as MonthlyExportColumnId);
}

export function sortMonthlyExportColumnIds(
  ids: readonly MonthlyExportColumnId[],
): MonthlyExportColumnId[] {
  const selected = new Set(ids);
  return MONTHLY_EXPORT_COLUMNS
    .map((column) => column.id)
    .filter((id) => selected.has(id));
}
