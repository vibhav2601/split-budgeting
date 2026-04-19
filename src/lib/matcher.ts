import { db } from "./db";
import { judgeMerchantMatches } from "./vision";
import type { MergeSuggestion, Transaction } from "./types";

const DATE_WINDOW_DAYS = 3;
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

function normalizeReconcileText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shouldExcludeSplitwiseFromReconcile(txn: Transaction): boolean {
  if (txn.source !== "splitwise") return false;
  if (txn.payer === "other") return true;

  const merchant = normalizeReconcileText(txn.merchant_raw);
  const description = normalizeReconcileText(txn.description);
  return merchant.includes("settle all balances") || description.includes("settle all balances");
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
  let others = [...unreconciled("credit_card"), ...unreconciled("venmo")];
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
  for (const p of scored) {
    if (!grouped.has(p.sw.id)) {
      grouped.set(p.sw.id, { splitwise_txn: p.sw, candidates: [] });
    }
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
  const suggestions = Array.from(grouped.values()).sort(
    (a, b) => (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0),
  );
  return { suggestions, focus_txn: focusTxn };
}

export function confirmMerge(params: {
  splitwise_txn_id: number;
  other_txn_ids: number[];
  notes?: string;
}): number {
  const d = db();
  const sw = d
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(params.splitwise_txn_id) as Transaction | undefined;
  if (!sw) throw new Error(`splitwise txn ${params.splitwise_txn_id} not found`);

  const tx = d.transaction((p: typeof params) => {
    const info = d
      .prepare(
        `INSERT INTO merge_groups(canonical_merchant, canonical_date, true_my_share, notes)
         VALUES(?, ?, ?, ?)`,
      )
      .run(sw.merchant_raw, sw.date, sw.amount_my_share, p.notes ?? null);
    const groupId = info.lastInsertRowid as number;
    const linkStmt = d.prepare(
      `INSERT INTO merge_links(merge_group_id, transaction_id, role) VALUES(?, ?, ?)`,
    );
    const reconcileStmt = d.prepare(
      `UPDATE transactions SET reconciled = 1 WHERE id = ?`,
    );
    linkStmt.run(groupId, sw.id, "splitwise_share");
    reconcileStmt.run(sw.id);
    for (const otherId of p.other_txn_ids) {
      const other = d
        .prepare("SELECT * FROM transactions WHERE id = ?")
        .get(otherId) as Transaction | undefined;
      if (!other) continue;
      const role = other.source === "credit_card" ? "cc_charge" : "venmo_settlement";
      linkStmt.run(groupId, other.id, role);
      reconcileStmt.run(other.id);
    }
    return groupId;
  });
  return tx(params);
}
