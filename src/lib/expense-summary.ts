import type Database from "better-sqlite3";
import type { MergeRole, Payer, Source, Transaction } from "@/lib/types";

export const VENMO_ADJUSTMENTS_CATEGORY = "Venmo adjustments";

export type MonthlyStats = {
  total: number;
  reconciled: number;
  pending: number;
};

export type CategoryCount = {
  category: string;
  count: number;
};

export function loadAvailableMonths(d: Database.Database): string[] {
  const rows = d
    .prepare(
      `SELECT DISTINCT substr(date, 1, 7) AS month FROM transactions ORDER BY month DESC`,
    )
    .all() as { month: string }[];
  return rows.map((r) => r.month);
}

export function loadMonthlyStats(d: Database.Database, month: string): MonthlyStats {
  const row = d
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN reconciled = 1 THEN 1 ELSE 0 END) AS reconciled,
         SUM(CASE WHEN reconciled = 0 AND mine_only = 0 THEN 1 ELSE 0 END) AS pending
       FROM transactions
       WHERE substr(date, 1, 7) = ?`,
    )
    .get(month) as MonthlyStats;
  return row;
}

export function loadCategoryCountsForMonth(d: Database.Database, month: string): CategoryCount[] {
  return d
    .prepare(
      `SELECT COALESCE(category, 'Uncategorized') AS category, COUNT(*) AS count
       FROM transactions
       WHERE substr(date, 1, 7) = ?
       GROUP BY category`,
    )
    .all(month) as CategoryCount[];
}

export type MonthlySpendRow = {
  month: string;
  category: string;
  true_spend: number;
};

export type MonthlyExportRow = {
  date: string;
  category: string;
  merchant: string;
  description: string;
  source: Source;
  final_amount: number;
  original_amount: number;
  my_share: number;
  payer: Payer;
  status: "merged" | "unreconciled";
  transaction_ids: string;
  merge_group_id: number | null;
};

type MergeGroupExportBase = {
  id: number;
  date: string;
  category: string | null;
  true_my_share: number;
  canonical_merchant: string;
};

type MergeLinkedTransaction = Transaction & {
  merge_group_id: number;
  role: MergeRole;
};

function normalizedCategoryForTransaction(txn: Pick<Transaction, "source" | "reconciled" | "payer" | "category">): string {
  if (txn.source === "venmo" && txn.reconciled === 0 && txn.payer === "me") {
    return VENMO_ADJUSTMENTS_CATEGORY;
  }
  return txn.category?.trim() || "Uncategorized";
}

function rankMergedLink(txn: MergeLinkedTransaction): number {
  switch (txn.role) {
    case "cc_charge":
      return 0;
    case "venmo_reimbursement":
      return 1;
    case "venmo_settlement":
      return 2;
    case "splitwise_share":
      return 3;
  }
}

function buildMergedMerchantLabel(links: MergeLinkedTransaction[], fallback: string): string {
  const merchants: string[] = [];
  for (const link of links) {
    const merchant = link.merchant_raw.trim();
    if (!merchant) continue;
    if (merchants.includes(merchant)) continue;
    merchants.push(merchant);
  }
  return merchants.length > 0 ? merchants.join(" + ") : fallback;
}

export function loadMonthlyTrueSpendRows(d: Database.Database): MonthlySpendRow[] {
  return d
    .prepare(
      `WITH unreconciled AS (
         SELECT
           substr(date, 1, 7) AS month,
           CASE
             WHEN source = 'venmo' AND reconciled = 0 AND payer = 'me'
               THEN '${VENMO_ADJUSTMENTS_CATEGORY}'
             ELSE COALESCE(category, 'Uncategorized')
           END AS category,
           SUM(
             CASE
               WHEN source = 'splitwise' AND reconciled = 0 THEN amount_my_share
               WHEN source = 'credit_card' AND reconciled = 0 THEN amount_my_share
               WHEN source = 'venmo' AND reconciled = 0 AND payer = 'me' THEN amount_my_share
               ELSE 0
             END
           ) AS amount
         FROM transactions
         GROUP BY month, category
       ),
       merged AS (
         SELECT
           substr(
             COALESCE(
               (
                 SELECT t.date
                 FROM merge_links ml
                 JOIN transactions t ON t.id = ml.transaction_id
                 WHERE ml.merge_group_id = mg.id
                   AND ml.role = 'splitwise_share'
                 LIMIT 1
               ),
               (
                 SELECT t.date
                 FROM merge_links ml
                 JOIN transactions t ON t.id = ml.transaction_id
                 WHERE ml.merge_group_id = mg.id
                   AND ml.role IN ('cc_charge', 'venmo_settlement', 'venmo_reimbursement')
                 LIMIT 1
               )
             ),
             1,
             7
           ) AS month,
           COALESCE(
             (
               SELECT t.category
               FROM merge_links ml
               JOIN transactions t ON t.id = ml.transaction_id
               WHERE ml.merge_group_id = mg.id
                 AND ml.role = 'splitwise_share'
               LIMIT 1
             ),
             (
               SELECT t.category
               FROM merge_links ml
               JOIN transactions t ON t.id = ml.transaction_id
               WHERE ml.merge_group_id = mg.id
                 AND ml.role IN ('cc_charge', 'venmo_settlement', 'venmo_reimbursement')
               LIMIT 1
             ),
             'Uncategorized'
           ) AS category,
           mg.true_my_share AS amount
         FROM merge_groups mg
       ),
       combined AS (
         SELECT month, category, amount FROM unreconciled
         UNION ALL
         SELECT month, category, amount FROM merged
       )
       SELECT
         month,
         category,
         ROUND(SUM(amount), 2) AS true_spend
       FROM combined
       GROUP BY month, category
       HAVING true_spend > 0
       ORDER BY month DESC, true_spend DESC`,
    )
    .all() as MonthlySpendRow[];
}

export function loadMonthlyExportRows(
  d: Database.Database,
  month: string,
): MonthlyExportRow[] {
  const unreconciled = d
    .prepare(
      `SELECT *
       FROM transactions
       WHERE substr(date, 1, 7) = ?
         AND (
           (source = 'splitwise' AND reconciled = 0)
           OR (source = 'credit_card' AND reconciled = 0)
           OR (source = 'venmo' AND reconciled = 0 AND payer = 'me')
         )
       ORDER BY date DESC, id DESC`,
    )
    .all(month) as Transaction[];

  const mergedGroups = d
    .prepare(
      `SELECT
         mg.id,
         COALESCE(
           (
             SELECT t.date
             FROM merge_links ml
             JOIN transactions t ON t.id = ml.transaction_id
             WHERE ml.merge_group_id = mg.id
               AND ml.role = 'splitwise_share'
             LIMIT 1
           ),
           (
             SELECT t.date
             FROM merge_links ml
             JOIN transactions t ON t.id = ml.transaction_id
             WHERE ml.merge_group_id = mg.id
               AND ml.role IN ('cc_charge', 'venmo_settlement', 'venmo_reimbursement')
             LIMIT 1
           ),
           mg.canonical_date
         ) AS date,
         COALESCE(
           (
             SELECT t.category
             FROM merge_links ml
             JOIN transactions t ON t.id = ml.transaction_id
             WHERE ml.merge_group_id = mg.id
               AND ml.role = 'splitwise_share'
             LIMIT 1
           ),
           (
             SELECT t.category
             FROM merge_links ml
             JOIN transactions t ON t.id = ml.transaction_id
             WHERE ml.merge_group_id = mg.id
               AND ml.role IN ('cc_charge', 'venmo_settlement', 'venmo_reimbursement')
             LIMIT 1
           )
         ) AS category,
         mg.true_my_share,
         mg.canonical_merchant
       FROM merge_groups mg
       WHERE substr(
         COALESCE(
           (
             SELECT t.date
             FROM merge_links ml
             JOIN transactions t ON t.id = ml.transaction_id
             WHERE ml.merge_group_id = mg.id
               AND ml.role = 'splitwise_share'
             LIMIT 1
           ),
           (
             SELECT t.date
             FROM merge_links ml
             JOIN transactions t ON t.id = ml.transaction_id
             WHERE ml.merge_group_id = mg.id
               AND ml.role IN ('cc_charge', 'venmo_settlement', 'venmo_reimbursement')
             LIMIT 1
           ),
           mg.canonical_date
         ),
         1,
         7
       ) = ?
       ORDER BY date DESC, mg.id DESC`,
    )
    .all(month) as MergeGroupExportBase[];

  const groupIds = mergedGroups.map((group) => group.id);
  const mergedLinks = groupIds.length === 0
    ? []
    : (d
      .prepare(
        `SELECT
           ml.merge_group_id,
           ml.role,
           t.*
         FROM merge_links ml
         JOIN transactions t ON t.id = ml.transaction_id
         WHERE ml.merge_group_id IN (${groupIds.map(() => "?").join(", ")})
         ORDER BY ml.merge_group_id ASC, t.date DESC, t.id DESC`,
      )
      .all(...groupIds) as MergeLinkedTransaction[]);

  const mergedLinksByGroup = new Map<number, MergeLinkedTransaction[]>();
  for (const link of mergedLinks) {
    const existing = mergedLinksByGroup.get(link.merge_group_id) ?? [];
    existing.push(link);
    mergedLinksByGroup.set(link.merge_group_id, existing);
  }

  const unreconciledRows = unreconciled.map((txn) => ({
    date: txn.date,
    category: normalizedCategoryForTransaction(txn),
    merchant: txn.merchant_raw,
    description: txn.description?.trim() || "",
    source: txn.source,
    final_amount: txn.amount_my_share,
    original_amount: txn.amount_total,
    my_share: txn.amount_my_share,
    payer: txn.payer,
    status: "unreconciled" as const,
    transaction_ids: String(txn.id),
    merge_group_id: null,
  }));

  const mergedRows = mergedGroups.map((group) => {
    const links = [...(mergedLinksByGroup.get(group.id) ?? [])].sort((a, b) => {
      const rankDiff = rankMergedLink(a) - rankMergedLink(b);
      if (rankDiff !== 0) return rankDiff;
      return a.id - b.id;
    });
    const splitwise = links.find((link) => link.role === "splitwise_share");
    const preferred = links.find((link) => link.source !== "splitwise") ?? splitwise ?? links[0];
    const merchant = buildMergedMerchantLabel(
      links,
      preferred?.merchant_raw || splitwise?.merchant_raw || group.canonical_merchant,
    );
    const description = preferred?.description?.trim()
      || splitwise?.description?.trim()
      || "";
    const source = preferred?.source ?? splitwise?.source ?? "splitwise";
    const payer = preferred?.payer ?? splitwise?.payer ?? "me";
    const originalAmount = preferred?.amount_total ?? splitwise?.amount_total ?? group.true_my_share;
    const transactionIds = links
      .map((link) => link.id)
      .sort((a, b) => a - b)
      .join(",");

    return {
      date: group.date,
      category: group.category?.trim() || "Uncategorized",
      merchant,
      description,
      source,
      final_amount: group.true_my_share,
      original_amount: originalAmount,
      my_share: group.true_my_share,
      payer,
      status: "merged" as const,
      transaction_ids: transactionIds,
      merge_group_id: group.id,
    };
  });

  return [...mergedRows, ...unreconciledRows].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const amountCmp = b.final_amount - a.final_amount;
    if (amountCmp !== 0) return amountCmp;
    if (a.merge_group_id !== null && b.merge_group_id !== null) {
      return b.merge_group_id - a.merge_group_id;
    }
    if (a.merge_group_id !== null) return -1;
    if (b.merge_group_id !== null) return 1;
    return b.transaction_ids.localeCompare(a.transaction_ids);
  });
}
