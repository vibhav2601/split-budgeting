export type Source = "credit_card" | "venmo" | "splitwise";
export type Payer = "me" | "other" | "shared";

export interface Transaction {
  id: number;
  source: Source;
  external_id: string | null;
  date: string;
  amount_total: number;
  amount_my_share: number;
  payer: Payer;
  merchant_raw: string;
  merchant_normalized: string;
  description: string | null;
  category: string | null;
  currency: string;
  reconciled: 0 | 1;
  mine_only: 0 | 1;
  raw_json: string | null;
}

export type MergeRole = "cc_charge" | "splitwise_share" | "venmo_settlement";

export interface MergeGroup {
  id: number;
  canonical_merchant: string;
  canonical_date: string;
  true_my_share: number;
  notes: string | null;
}

export interface MergeSuggestion {
  splitwise_txn: Transaction;
  candidates: Array<{
    txn: Transaction;
    score: number;
    reasons: string[];
  }>;
}

export interface ReconcileSuggestResponse {
  suggestions: MergeSuggestion[];
  focus_txn: Transaction | null;
}
