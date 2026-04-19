# Budget Reconciler

Personal budgeting app that reconciles credit card, Venmo, and Splitwise
activity into your *true* personal spend. When Splitwise says your share of a
$100 dinner was $25, the $100 credit card charge stops double-counting.

## Setup

```bash
cp .env.local.example .env.local
# fill in OPENAI_API_KEY and SPLITWISE_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

### Getting keys

- **OpenAI**: https://platform.openai.com/api-keys (uses `gpt-4o` by default; override with `OPENAI_MODEL`)
- **Splitwise**: https://secure.splitwise.com/oauth_clients — "Register your
  application," then click "Generate API key." Works on the free plan.

## Flow

1. `/import` — upload credit card / Venmo / Splitwise CSVs, or screenshots
   (parsed with GPT vision), or sync Splitwise via API.
2. `/reconcile` — Splitwise reconcile: review suggested merges, pick the real match, confirm.
3. `/` — dashboard shows monthly true-spend by category.

## Matching algorithm

For each unreconciled Splitwise expense that you paid or shared, excluding
settlement rows like "Settle all balances", we search credit card + Venmo
transactions within ±3 days and score candidates on:

- **Amount**: Splitwise group total ≈ CC amount (within 15% tolerance).
- **Date**: exact / ±1 / ±3.
- **Payer**: "I paid" in Splitwise → expect CC charge. "They paid" →
  expect Venmo outflow from you.
- **Merchant**: GPT judges whether "dinner" and "TACO BELL #1234" are the
  same thing, in one batched call.

Composite score ≥ 0.45 = suggested. You confirm, and the merged entry
becomes `amount_my_share`; the CC/Venmo rows are flagged reconciled.

## Storage

Local SQLite at `./data/budget.db` (configurable via `BUDGET_DB_PATH`). The
folder is gitignored. Delete it to start fresh.
