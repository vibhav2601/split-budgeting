import { db } from "./db";
import {
  shouldExcludeOtherTxnFromReconcile,
  shouldExcludeSplitwiseFromReconcile,
} from "./reconcile-filters";
import { judgeMerchantMatches } from "./vision";
import type { MergeSuggestion, Transaction } from "./types";

const DATE_WINDOW_DAYS = 3;
const FALLBACK_DATE_WINDOW_DAYS = 7;
const AMOUNT_TOLERANCE = 0.15;
const MIN_SCORE = 0.45;

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db_ = new Date(b).getTime();
  return Math.abs(da - db_) / 86_400_000;
}

function dateScore(d1: string, d2: string): number {
  const diff = daysBetween(d1, d2);
  if (diff === 0) return 1.0;
  if (diff <= 1) return 0.8;
  if (diff <= 3) return 0.5;
  return 0;
}

function amountScore(ccTotal: number, swTotal: number): number {
  const delta = Math.abs(ccTotal - swTotal) / Math.max(ccTotal, swTotal, 1);
  if (delta < 0.02) return 1.0;
  if (delta <= AMOUNT_TOLERANCE) return 0.8;
  if (delta <= 0.3) return 0.4;
  return 0;
}

function payerScore(sw: Transaction, other: Transaction): number {
  if (sw.payer === "me" && other.source === "credit_card") return 1.0;
  if (sw.payer === "other" && other.source === "venmo") return 1.0;
  if (sw.payer === "shared") return 0.7;
  return 0.3;
}

function fallbackCandidatesForPaidByMe(
  sw: Transaction,
  others: Transaction[],
): Array<{ txn: Transaction; score: number; reasons: string[] }> {
  if (sw.payer !== "me") return [];

  return others
    .filter((other) => other.source === "credit_card")
    .filter((other) => daysBetween(sw.date, other.date) <= FALLBACK_DATE_WINDOW_DAYS)
    .map((other) => {
      const dateDiff = daysBetween(sw.date, other.date);
      const amountDelta = Math.abs(other.amount_total - sw.amount_total);
      const amountRatio =
        amountDelta / Math.max(other.amount_total, sw.amount_total, 1);
      const merchantRelated =
        Boolean(sw.merchant_normalized) &&
        Boolean(other.merchant_normalized) &&
        (sw.merchant_normalized.includes(other.merchant_normalized) ||
          other.merchant_normalized.includes(sw.merchant_normalized));

      const dateComponent =
        dateDiff === 0 ? 0.2 : dateDiff <= 1 ? 0.16 : dateDiff <= 3 ? 0.12 : 0.08;
      const amountComponent =
        amountRatio <= 0.02
          ? 0.2
          : amountRatio <= 0.15
            ? 0.16
            : amountRatio <= 0.3
              ? 0.12
              : amountRatio <= 0.5
                ? 0.08
                : 0.04;
      const merchantComponent = merchantRelated ? 0.04 : 0;
      const score = Math.min(0.44, dateComponent + amountComponent + merchantComponent);

      return {
        txn: other,
        score,
        reasons: [
          "fallback manual-review candidate",
          `date Δ=${dateDiff.toFixed(0)}d`,
          `amount ${other.amount_total} vs ${sw.amount_total}`,
          merchantRelated ? "merchant substring match" : "merchant unclear",
        ],
      };
    })
    .sort((a, b) => b.score - a.score || b.txn.date.localeCompare(a.txn.date) || b.txn.id - a.txn.id)
    .slice(0, 5);
}

function unreconciled(source?: Transaction["source"]): Transaction[] {
  const sql = source
    ? `SELECT * FROM transactions WHERE reconciled = 0 AND mine_only = 0 AND source = ? ORDER BY date DESC`
    : `SELECT * FROM transactions WHERE reconciled = 0 AND mine_only = 0 ORDER BY date DESC`;
  const stmt = db().prepare(sql);
  return (source ? stmt.all(source) : stmt.all()) as Transaction[];
}

function getTransaction(id: number): Transaction | null {
  return (
    (db().prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Transaction | undefined) ??
    null
  );
}

export async function suggestMerges(params: {
  other_txn_id?: number;
} = {}): Promise<{ suggestions: MergeSuggestion[]; focus_txn: Transaction | null }> {
  const swTxns = unreconciled("splitwise").filter((txn) => !shouldExcludeSplitwiseFromReconcile(txn));
  let others = [...unreconciled("credit_card"), ...unreconciled("venmo")].filter(
    (txn) => !shouldExcludeOtherTxnFromReconcile(txn),
  );
  const focusTxn =
    typeof params.other_txn_id === "number" ? getTransaction(params.other_txn_id) : null;
  if (focusTxn) {
    if (focusTxn.source === "splitwise") {
      throw new Error("focused transaction must be credit card or venmo");
    }
    others = others.filter((txn) => txn.id === focusTxn.id);
  }

  const pending: {
    sw: Transaction;
    other: Transaction;
    baseScore: number;
    reasons: string[];
  }[] = [];

  for (const sw of swTxns) {
    for (const other of others) {
      if (daysBetween(sw.date, other.date) > DATE_WINDOW_DAYS) continue;
      const dScore = dateScore(sw.date, other.date);
      const aScore = amountScore(other.amount_total, sw.amount_total);
      const pScore = payerScore(sw, other);
      if (aScore === 0) continue;
      const base = dScore * 0.3 + aScore * 0.5 + pScore * 0.2;
      const reasons = [
        `date Δ=${daysBetween(sw.date, other.date).toFixed(0)}d`,
        `amount ${other.amount_total} vs ${sw.amount_total}`,
        `payer sw=${sw.payer} src=${other.source}`,
      ];
      pending.push({ sw, other, baseScore: base, reasons });
    }
  }

  const needLLM = pending.filter((p) => p.baseScore >= 0.4 && p.baseScore < 0.8);
  const llmResults = await judgeMerchantMatches(
    needLLM.map((p) => ({
      splitwise_desc: p.sw.merchant_raw,
      other_merchant: p.other.merchant_raw,
    })),
  );
  const llmByIdx = new Map<number, { match: boolean; confidence: number; reason: string }>();
  needLLM.forEach((_, i) => llmByIdx.set(pending.indexOf(needLLM[i]), llmResults[i]));

  const scored = pending
    .map((p, i) => {
      const llm = llmByIdx.get(i);
      let merchantBoost = 0;
      if (llm) {
        merchantBoost = llm.match ? llm.confidence * 0.3 : -0.2;
        p.reasons.push(`llm: ${llm.reason}`);
      } else if (p.sw.merchant_normalized && p.other.merchant_normalized) {
        if (
          p.sw.merchant_normalized.includes(p.other.merchant_normalized) ||
          p.other.merchant_normalized.includes(p.sw.merchant_normalized)
        ) {
          merchantBoost = 0.2;
          p.reasons.push("merchant substring match");
        }
      }
      return { ...p, score: Math.min(1, p.baseScore + merchantBoost) };
    })
    .filter((p) => p.score >= MIN_SCORE);

  const grouped = new Map<number, MergeSuggestion>();
  for (const sw of swTxns) {
    grouped.set(sw.id, { splitwise_txn: sw, candidates: [] });
  }
  for (const p of scored) {
    grouped.get(p.sw.id)!.candidates.push({
      txn: p.other,
      score: p.score,
      reasons: p.reasons,
    });
  }
  for (const g of grouped.values()) {
    g.candidates.sort((a, b) => b.score - a.score);
    g.candidates = g.candidates.slice(0, 5);
  }
  for (const g of grouped.values()) {
    if (g.candidates.length > 0) continue;
    g.candidates = fallbackCandidatesForPaidByMe(g.splitwise_txn, others);
  }
  const suggestions = Array.from(grouped.values()).sort(
    (a, b) =>
      (b.candidates[0]?.score ?? -1) - (a.candidates[0]?.score ?? -1) ||
      b.splitwise_txn.date.localeCompare(a.splitwise_txn.date) ||
      b.splitwise_txn.id - a.splitwise_txn.id,
  );
  return { suggestions, focus_txn: focusTxn };
}

export function confirmMerge(params: {
  splitwise_txn_id: number;
  other_txn_ids: number[];
  true_my_share: number;
  notes?: string;
}): number {
  const d = db();
  const sw = d
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(params.splitwise_txn_id) as Transaction | undefined;
  if (!sw) throw new Error(`splitwise txn ${params.splitwise_txn_id} not found`);
  if (!Array.isArray(params.other_txn_ids) || params.other_txn_ids.length === 0) {
    throw new Error("at least one matched transaction is required");
  }
  if (!Number.isFinite(params.true_my_share) || params.true_my_share < 0) {
    throw new Error("true_my_share must be a non-negative number");
  }

  const otherIds = Array.from(new Set(params.other_txn_ids));
  const others = otherIds.map((id) =>
    d.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Transaction | undefined,
  );
  if (others.some((txn) => !txn)) {
    throw new Error("one or more matched transactions were not found");
  }
  const matchedTxns = others as Transaction[];
  const matchedSource = matchedTxns[0]?.source;
  if (!matchedSource || matchedSource === "splitwise") {
    throw new Error("matched transactions must be credit card or venmo");
  }
  if (matchedTxns.some((txn) => txn.source !== matchedSource)) {
    throw new Error("all matched transactions must be from the same source");
  }
  for (const other of matchedTxns) {
    if (other.reconciled) throw new Error("one or more matched transactions are already merged");
    if (other.mine_only) throw new Error("one or more matched transactions are marked mine only");
  }
  const matchedTotal = matchedTxns.reduce((sum, txn) => sum + txn.amount_total, 0);
  if (params.true_my_share > matchedTotal) {
    throw new Error("true_my_share cannot exceed matched transaction total");
  }

  const tx = d.transaction((p: typeof params) => {
    const info = d
      .prepare(
        `INSERT INTO merge_groups(canonical_merchant, canonical_date, true_my_share, notes)
         VALUES(?, ?, ?, ?)`,
      )
      .run(sw.merchant_raw, sw.date, p.true_my_share, p.notes ?? null);
    const groupId = info.lastInsertRowid as number;
    const linkStmt = d.prepare(
      `INSERT INTO merge_links(merge_group_id, transaction_id, role) VALUES(?, ?, ?)`,
    );
    const reconcileStmt = d.prepare(
      `UPDATE transactions SET reconciled = 1 WHERE id = ?`,
    );
    linkStmt.run(groupId, sw.id, "splitwise_share");
    reconcileStmt.run(sw.id);
    for (const other of matchedTxns) {
      const role = other.source === "credit_card" ? "cc_charge" : "venmo_settlement";
      linkStmt.run(groupId, other.id, role);
      reconcileStmt.run(other.id);
    }
    return groupId;
  });
  return tx(params);
}

export function confirmVenmoReimbursementMerge(params: {
  credit_card_txn_id: number;
  venmo_txn_ids: number[];
  true_my_share: number;
  notes?: string;
}): number {
  const d = db();
  const cc = d
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(params.credit_card_txn_id) as Transaction | undefined;
  if (!cc) throw new Error(`credit card txn ${params.credit_card_txn_id} not found`);
  if (cc.source !== "credit_card") throw new Error("credit_card_txn_id must be a credit card row");
  if (cc.reconciled) throw new Error("credit card transaction is already merged");
  if (cc.mine_only) throw new Error("credit card transaction is marked mine only");
  if (!Array.isArray(params.venmo_txn_ids) || params.venmo_txn_ids.length === 0) {
    throw new Error("at least one Venmo reimbursement is required");
  }
  if (!Number.isFinite(params.true_my_share) || params.true_my_share < 0) {
    throw new Error("true_my_share must be a non-negative number");
  }
  if (params.true_my_share > cc.amount_total) {
    throw new Error("true_my_share cannot exceed credit card total");
  }

  const venmoTxns = params.venmo_txn_ids.map((id) =>
    d.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Transaction | undefined,
  );
  if (venmoTxns.some((txn) => !txn)) {
    throw new Error("one or more Venmo reimbursements were not found");
  }
  for (const venmo of venmoTxns as Transaction[]) {
    if (venmo.source !== "venmo") throw new Error("all reimbursement rows must be Venmo");
    if (venmo.payer !== "other") throw new Error("only received Venmo transactions can reimburse");
    if (venmo.reconciled) throw new Error("one or more Venmo reimbursements are already merged");
    if (venmo.mine_only) throw new Error("one or more Venmo reimbursements are marked mine only");
  }

  const tx = d.transaction((p: typeof params) => {
    const info = d
      .prepare(
        `INSERT INTO merge_groups(canonical_merchant, canonical_date, true_my_share, notes)
         VALUES(?, ?, ?, ?)`,
      )
      .run(cc.merchant_raw, cc.date, p.true_my_share, p.notes ?? null);
    const groupId = info.lastInsertRowid as number;
    const linkStmt = d.prepare(
      `INSERT INTO merge_links(merge_group_id, transaction_id, role) VALUES(?, ?, ?)`,
    );
    const reconcileStmt = d.prepare(
      `UPDATE transactions SET reconciled = 1 WHERE id = ?`,
    );

    linkStmt.run(groupId, cc.id, "cc_charge");
    reconcileStmt.run(cc.id);
    for (const venmo of venmoTxns as Transaction[]) {
      linkStmt.run(groupId, venmo.id, "venmo_reimbursement");
      reconcileStmt.run(venmo.id);
    }
    return groupId;
  });
  return tx(params);
}
