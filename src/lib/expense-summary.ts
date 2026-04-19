import type Database from "better-sqlite3";

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
