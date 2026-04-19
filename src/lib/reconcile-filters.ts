import type { Transaction } from "./types";

const CREDIT_CARD_RECONCILE_IGNORE_PATTERNS = [
  "payment thank you",
  "online ach payment",
  "ach deposit",
  "internet transfer",
  "last statement bal",
  "statement balance",
  "balance for last month",
  "balacne for last month",
  "balance transfer",
  "automatic payment",
  "autopay",
];

export function normalizeReconcileText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

export function shouldExcludeSplitwiseFromReconcile(txn: Transaction): boolean {
  if (txn.source !== "splitwise") return false;
  if (txn.payer === "other") return true;

  const merchant = normalizeReconcileText(txn.merchant_raw);
  const description = normalizeReconcileText(txn.description);
  return merchant.includes("settle all balances") || description.includes("settle all balances");
}

export function shouldExcludeOtherTxnFromReconcile(txn: Transaction): boolean {
  if (txn.source !== "credit_card") return false;

  const category = normalizeReconcileText(txn.category);
  if (category === "payment") return true;

  const text = normalizeReconcileText(
    `${txn.merchant_raw} ${txn.description ?? ""} ${txn.category ?? ""}`,
  );
  return CREDIT_CARD_RECONCILE_IGNORE_PATTERNS.some((pattern) => text.includes(pattern));
}

export function transactionMatchesSearch(txn: Transaction, query: string): boolean {
  const normalizedQuery = normalizeReconcileText(query);
  if (!normalizedQuery) return true;

  return normalizeReconcileText(
    [
      txn.merchant_raw,
      txn.description ?? "",
      txn.category ?? "",
      txn.date,
      txn.source,
      txn.payer,
      txn.amount_total.toFixed(2),
      txn.amount_my_share.toFixed(2),
    ].join(" "),
  ).includes(normalizedQuery);
}
