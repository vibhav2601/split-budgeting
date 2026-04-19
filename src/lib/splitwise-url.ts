import type { Transaction } from "./types";

const SPLITWISE_EXPENSE_BASE_URL = "https://secure.splitwise.com/#/expenses";

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function getSplitwiseExpenseId(transaction: Transaction): number | null {
  if (transaction.source !== "splitwise") return null;

  const externalMatch = transaction.external_id?.match(/^sw:(\d+)$/);
  if (externalMatch) {
    return Number(externalMatch[1]);
  }

  if (!transaction.raw_json) return null;

  try {
    const parsed = JSON.parse(transaction.raw_json) as { id?: unknown };
    return parseNumericId(parsed.id);
  } catch {
    return null;
  }
}

export function getSplitwiseExpenseUrl(transaction: Transaction): string | null {
  const expenseId = getSplitwiseExpenseId(transaction);
  return expenseId ? `${SPLITWISE_EXPENSE_BASE_URL}/${expenseId}` : null;
}
