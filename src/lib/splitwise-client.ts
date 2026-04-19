import { normalizeMerchant } from "./merchant-normalize";
import type { ParsedRow } from "./parsers";

const BASE = "https://secure.splitwise.com/api/v3.0";

interface SplitwiseUser {
  id: number;
  first_name?: string;
  last_name?: string;
}

interface SplitwiseExpenseUser {
  user: SplitwiseUser;
  user_id: number;
  paid_share: string;
  owed_share: string;
  net_balance: string;
}

interface SplitwiseExpense {
  id: number;
  description: string;
  cost: string;
  currency_code: string;
  date: string;
  category?: { name: string };
  deleted_at: string | null;
  payment: boolean;
  users: SplitwiseExpenseUser[];
}

function apiKey(): string {
  const k = process.env.SPLITWISE_API_KEY;
  if (!k) throw new Error("SPLITWISE_API_KEY not set in .env.local");
  return k;
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    throw new Error(`Splitwise ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function getCurrentUserId(): Promise<number> {
  const res = await call<{ user: SplitwiseUser }>("/get_current_user");
  return res.user.id;
}

export async function fetchExpenses(params: {
  updated_after?: string;
  limit?: number;
}): Promise<SplitwiseExpense[]> {
  const qs = new URLSearchParams();
  if (params.updated_after) qs.set("updated_after", params.updated_after);
  qs.set("limit", String(params.limit ?? 200));
  const res = await call<{ expenses: SplitwiseExpense[] }>(
    `/get_expenses?${qs.toString()}`,
  );
  return res.expenses.filter((e) => !e.deleted_at && !e.payment);
}

export function splitwiseExpenseToRow(
  e: SplitwiseExpense,
  myUserId: number,
): ParsedRow | null {
  const me = e.users.find((u) => u.user_id === myUserId);
  if (!me) return null;
  const total = Math.abs(parseFloat(e.cost));
  const share = Math.abs(parseFloat(me.owed_share));
  const paid = Math.abs(parseFloat(me.paid_share));
  if (!Number.isFinite(total) || !Number.isFinite(share)) return null;
  const iso = e.date.slice(0, 10);
  return {
    source: "splitwise",
    external_id: `sw:${e.id}`,
    date: iso,
    amount_total: total,
    amount_my_share: share,
    payer: paid > 0 ? (paid >= total - 0.01 ? "me" : "shared") : "other",
    merchant_raw: e.description,
    merchant_normalized: normalizeMerchant(e.description),
    description: e.description,
    category: e.category?.name ?? null,
    currency: e.currency_code ?? "USD",
    raw_json: JSON.stringify(e),
  };
}
