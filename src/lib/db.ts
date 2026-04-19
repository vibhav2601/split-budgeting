import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.BUDGET_DB_PATH ?? "./data/budget.db";

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  migrate(instance);
  return instance;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK(source IN ('credit_card','venmo','splitwise')),
      external_id TEXT,
      date TEXT NOT NULL,
      amount_total REAL NOT NULL,
      amount_my_share REAL NOT NULL,
      payer TEXT NOT NULL CHECK(payer IN ('me','other','shared')) DEFAULT 'me',
      merchant_raw TEXT NOT NULL,
      merchant_normalized TEXT NOT NULL,
      description TEXT,
      category TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      reconciled INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      UNIQUE(source, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_txn_source ON transactions(source);
    CREATE INDEX IF NOT EXISTS idx_txn_reconciled ON transactions(reconciled);

    CREATE TABLE IF NOT EXISTS merge_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_merchant TEXT NOT NULL,
      canonical_date TEXT NOT NULL,
      true_my_share REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS merge_links (
      merge_group_id INTEGER NOT NULL REFERENCES merge_groups(id) ON DELETE CASCADE,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('cc_charge','splitwise_share','venmo_settlement')),
      PRIMARY KEY(merge_group_id, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      filename TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      row_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}
